import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Send,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  User,
  Clock,
  BookOpen,
  Calendar,
  GraduationCap
} from 'lucide-react';
import { commsOps, teacherOps } from '../store/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

// 格式化时间为北京/马尼拉时间 (GMT+8)
function formatTime(dateStr) {
  if (!dateStr) return '—';
  let isoStr = dateStr;
  if (!isoStr.endsWith('Z') && !isoStr.includes('+')) {
    isoStr = isoStr.replace(' ', 'T') + 'Z';
  }
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return dateStr;
  }
}

export default function Comms() {
  const [queue, setQueue] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  // 会话 thread 状态
  const [conversationData, setConversationData] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);

  // 操作表单局部状态 (针对各个 pending 消息或 replied 消息)
  // [messageId]: { actionType: 'forward' | 'direct', teacherId: '', contentEn: '', contentZh: '' }
  const [actionForms, setActionForms] = useState({});
  // 内部备注输入框状态
  const [internalNoteText, setInternalNoteText] = useState('');

  // 正在提交的状态: { [key]: boolean }
  const [submitting, setSubmitting] = useState({});
  // 错误提示文案
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // 加载教师列表
  useEffect(() => {
    async function loadTeachers() {
      try {
        const list = await teacherOps.getAll();
        setTeachers(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('获取教师列表失败:', err);
      }
    }
    loadTeachers();
  }, []);

  // 加载待办队列
  const fetchQueue = useCallback(async (keepSelected = true) => {
    setLoadingQueue(true);
    setErrorMessage('');
    try {
      const data = await commsOps.getQueue();
      const list = Array.isArray(data) ? data : [];
      setQueue(list);

      // 如果未选择会话或之前选中的会话不存在，自动选中第一组
      setSelectedConversationId((prevId) => {
        if (keepSelected && prevId && list.some((item) => item.conversation_id === prevId)) {
          return prevId;
        }
        if (list.length > 0) {
          return list[0].conversation_id;
        }
        return prevId;
      });
    } catch (err) {
      console.error('获取家校待办队列失败:', err);
      setErrorMessage(err.message || '获取家校待办队列失败');
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  // 首次打开页面加载
  useEffect(() => {
    fetchQueue(false);
  }, [fetchQueue]);

  // 加载选中的会话详情 thread
  const fetchThread = useCallback(async (convId) => {
    if (!convId) {
      setConversationData(null);
      return;
    }
    setLoadingThread(true);
    setErrorMessage('');
    try {
      const data = await commsOps.getConversation({ conversation_id: convId });
      setConversationData(data);
    } catch (err) {
      console.error('获取会话详情失败:', err);
      setErrorMessage(err.message || '获取会话详情失败');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  // 当选中会话变化时加载 thread
  useEffect(() => {
    if (selectedConversationId) {
      fetchThread(selectedConversationId);
    }
  }, [selectedConversationId, fetchThread]);

  // 将队列按会话（学员）分组，最旧优先
  const groupedQueue = useMemo(() => {
    const map = new Map();
    queue.forEach((item) => {
      const convId = item.conversation_id;
      if (!map.has(convId)) {
        map.set(convId, {
          conversation_id: convId,
          student_id: item.student_id,
          student_name: item.student_name,
          student_english_name: item.student_english_name,
          remaining_hours: item.remaining_hours,
          current_teacher_id: item.current_teacher_id,
          current_teacher_name: item.current_teacher_name,
          last_class_date: item.last_class_date,
          earliest_created_at: item.created_at,
          pending_count: 0,
          replied_by_teacher_count: 0,
          items: [],
        });
      }
      const group = map.get(convId);
      group.items.push(item);
      if (item.relay_status === 'pending') {
        group.pending_count += 1;
      } else if (item.relay_status === 'replied_by_teacher') {
        group.replied_by_teacher_count += 1;
      }
      // 保持最早的待办时间作为排序标准
      if (new Date(item.created_at) < new Date(group.earliest_created_at)) {
        group.earliest_created_at = item.created_at;
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.earliest_created_at) - new Date(b.earliest_created_at)
    );
  }, [queue]);

  // 统计指标
  const totalPendingMessages = useMemo(
    () => queue.filter((i) => i.relay_status === 'pending').length,
    [queue]
  );
  const totalRepliedWaitingApproval = useMemo(
    () => queue.filter((i) => i.relay_status === 'replied_by_teacher').length,
    [queue]
  );

  // 表单更新辅助函数
  const updateActionForm = (msgId, field, val) => {
    setActionForms((prev) => ({
      ...prev,
      [msgId]: {
        ...(prev[msgId] || { actionType: 'forward' }),
        [field]: val,
      },
    }));
  };

  // 1. 转交外教操作
  const handleForward = async (message, defaultTeacherId) => {
    const form = actionForms[message.id] || {};
    const contentEn = (form.contentEn || '').trim();
    const teacherId = form.teacherId ? parseInt(form.teacherId, 10) : defaultTeacherId;

    if (!contentEn) {
      setErrorMessage('请填写转交外教的英文内容 (content_en)');
      return;
    }
    if (!teacherId) {
      setErrorMessage('学员暂无上课老师，请手动选择接收外教');
      return;
    }

    setSubmitting((prev) => ({ ...prev, [`forward_${message.id}`]: true }));
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await commsOps.forward({
        message_id: message.id,
        teacher_id: teacherId,
        content_en: contentEn,
      });
      setSuccessMessage('已成功转交给外教');
      // 清理表单
      setActionForms((prev) => {
        const next = { ...prev };
        delete next[message.id];
        return next;
      });
      // 刷新队列与当前 thread
      await fetchQueue(true);
      await fetchThread(selectedConversationId);
    } catch (err) {
      console.error('转交外教失败:', err);
      setErrorMessage(err.message || '转交外教失败');
    } finally {
      setSubmitting((prev) => ({ ...prev, [`forward_${message.id}`]: false }));
    }
  };

  // 2. 顾问直接回复操作
  const handleDirectReply = async (message) => {
    const form = actionForms[message.id] || {};
    const contentZh = (form.contentZh || '').trim();

    if (!contentZh) {
      setErrorMessage('请填写直接回复家长的中文内容 (content_zh)');
      return;
    }

    setSubmitting((prev) => ({ ...prev, [`direct_${message.id}`]: true }));
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await commsOps.directReply({
        conversation_id: message.conversation_id,
        content_zh: contentZh,
      });
      setSuccessMessage('顾问回复已发布，并已联动通知家长');
      setActionForms((prev) => {
        const next = { ...prev };
        delete next[message.id];
        return next;
      });
      await fetchQueue(true);
      await fetchThread(selectedConversationId);
    } catch (err) {
      console.error('直接回复失败:', err);
      setErrorMessage(err.message || '直接回复失败');
    } finally {
      setSubmitting((prev) => ({ ...prev, [`direct_${message.id}`]: false }));
    }
  };

  // 3. 放行老师回复操作
  const handlePublish = async (message) => {
    const form = actionForms[message.id] || {};
    const contentZh = (form.contentZh || '').trim();

    setSubmitting((prev) => ({ ...prev, [`publish_${message.id}`]: true }));
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await commsOps.publish({
        message_id: message.id,
        content_zh: contentZh,
      });
      setSuccessMessage(
        contentZh
          ? '已成功放行老师回复，双语内容已发布给家长'
          : '已成功放行老师回复，已发布给家长'
      );
      setActionForms((prev) => {
        const next = { ...prev };
        delete next[message.id];
        return next;
      });
      await fetchQueue(true);
      await fetchThread(selectedConversationId);
    } catch (err) {
      console.error('放行失败:', err);
      setErrorMessage(err.message || '放行失败');
    } finally {
      setSubmitting((prev) => ({ ...prev, [`publish_${message.id}`]: false }));
    }
  };

  // 4. 保存内部备注
  const handleAddInternalNote = async () => {
    const text = internalNoteText.trim();
    if (!text || !selectedConversationId) return;

    setSubmitting((prev) => ({ ...prev, internalNote: true }));
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await commsOps.addInternalNote({
        conversation_id: selectedConversationId,
        content: text,
      });
      setInternalNoteText('');
      setSuccessMessage('内部备注已保存（仅管理端可见）');
      await fetchThread(selectedConversationId);
    } catch (err) {
      console.error('保存内部备注失败:', err);
      setErrorMessage(err.message || '保存内部备注失败');
    } finally {
      setSubmitting((prev) => ({ ...prev, internalNote: false }));
    }
  };

  // 当前激活学员信息（优先取 thread 返回的 student，兜底取 queue item）
  const activeStudent = conversationData?.student || (
    groupedQueue.find((g) => g.conversation_id === selectedConversationId)
  );

  return (
    <div className="space-y-6">
      {/* 顶部标题栏与全局刷新 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>💬 家校沟通分流面板</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Roger 专属手动分流工作台：家长留言转交外教（手写双语）、外教回复审核放行、教务中文直回与内部沟通留痕
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchQueue(true)}
            disabled={loadingQueue}
            className="flex items-center gap-1.5"
            title="刷新待办队列"
          >
            <RefreshCw size={15} className={loadingQueue ? 'animate-spin' : ''} />
            <span>刷新队列</span>
          </Button>
        </div>
      </div>

      {/* 待办指标总览卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary-500">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-gray-500">待处理总数</div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-gray-900">{queue.length}</div>
              <Badge variant="outline" className="text-xs">
                {groupedQueue.length} 个学员会话
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-gray-500">家长新留言 (待分流)</div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-amber-600">{totalPendingMessages}</div>
              <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                待转交 / 直回
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="p-4">
            <div className="text-sm font-medium text-gray-500">外教回复 (待放行)</div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-2xl font-bold text-indigo-600">{totalRepliedWaitingApproval}</div>
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs">
                手写中文放行
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 全局错误与成功提示 */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-0.5"
          >
            关闭
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            className="text-green-400 hover:text-green-600 text-xs font-semibold px-2 py-0.5"
          >
            关闭
          </button>
        </div>
      )}

      {/* 主工作区：左侧待办分组列表 + 右侧会话详情与操作 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧列表：按学员分组的待办队列 */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Clock size={16} className="text-primary-600" />
              <span>待办队列（最旧优先）</span>
            </h2>
            <span className="text-xs text-gray-400">{groupedQueue.length} 组待处理</span>
          </div>

          {loadingQueue && queue.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-primary-500" />
                <p className="text-sm">正在加载待办队列...</p>
              </CardContent>
            </Card>
          ) : groupedQueue.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-medium text-gray-800">暂无待办事项</p>
                <p className="text-xs text-gray-400 mt-1">
                  当前所有家长留言均已转交或回复，所有外教回复均已放行。
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {groupedQueue.map((group) => {
                const isSelected = group.conversation_id === selectedConversationId;
                return (
                  <button
                    key={group.conversation_id}
                    type="button"
                    onClick={() => setSelectedConversationId(group.conversation_id)}
                    className={`w-full text-left transition-all rounded-xl p-4 border block ${
                      isSelected
                        ? 'bg-primary-50/60 border-primary-500 shadow-sm ring-1 ring-primary-500'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                          <User size={15} className="text-gray-400" />
                          <span>{group.student_name}</span>
                          {group.student_english_name && (
                            <span className="text-gray-500 font-normal">
                              ({group.student_english_name})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span>
                              剩余课时:{' '}
                              <strong className="text-gray-700">
                                {group.remaining_hours ?? 0}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              老师:{' '}
                              <strong className="text-gray-700">
                                {group.current_teacher_name || '未分配'}
                              </strong>
                            </span>
                          </div>
                          <div>
                            最近上课:{' '}
                            <span className="text-gray-600">
                              {group.last_class_date || '无上课记录'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 待办标签 */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {group.pending_count > 0 && (
                          <Badge variant="warning" className="text-xs">
                            留言 ×{group.pending_count}
                          </Badge>
                        )}
                        {group.replied_by_teacher_count > 0 && (
                          <Badge variant="primary" className="text-xs">
                            待放行 ×{group.replied_by_teacher_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 右侧详情：会话 Thread 与分流操作 */}
        <div className="lg:col-span-8 space-y-4">
          {!selectedConversationId ? (
            <Card>
              <CardContent className="p-12 text-center text-gray-400">
                <MessageSquare size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="text-base font-medium text-gray-700">请选择左侧学员会话</p>
                <p className="text-xs text-gray-400 mt-1">
                  选择待办队列中的会话以查看完整沟通历史并执行分流、回复与放行操作
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {/* 学员上下文卡片头部 */}
              <div className="bg-gray-50/80 p-4 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-900">
                        {activeStudent?.student_name || activeStudent?.name || '学员会话'}
                      </span>
                      {(activeStudent?.student_english_name || activeStudent?.english_name) && (
                        <span className="text-sm font-medium text-gray-600">
                          ({activeStudent?.student_english_name || activeStudent?.english_name})
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs ml-1">
                        会话 #{selectedConversationId}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1.5">
                      <span className="flex items-center gap-1">
                        <BookOpen size={13} className="text-gray-400" />
                        剩余课时:{' '}
                        <strong className="text-primary-700 font-semibold">
                          {activeStudent?.remaining_hours ?? 0}
                        </strong>{' '}
                        课时
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <GraduationCap size={13} className="text-gray-400" />
                        当前老师:{' '}
                        <strong className="text-gray-800">
                          {activeStudent?.current_teacher_name || '未分配'}
                        </strong>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar size={13} className="text-gray-400" />
                        最近上课:{' '}
                        <span className="text-gray-700">
                          {activeStudent?.last_class_date || '无上课记录'}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchThread(selectedConversationId)}
                      disabled={loadingThread}
                      className="text-xs"
                      title="刷新当前会话"
                    >
                      <RefreshCw size={13} className={loadingThread ? 'animate-spin' : ''} />
                      <span className="ml-1">刷新记录</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Thread 消息列表 */}
              <div className="p-4 sm:p-6 space-y-4 max-h-[680px] overflow-y-auto bg-gray-50/30">
                {loadingThread && !conversationData ? (
                  <div className="py-12 text-center text-gray-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-primary-500" />
                    <p className="text-sm">正在加载会话历史...</p>
                  </div>
                ) : !conversationData?.messages || conversationData.messages.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <MessageSquare size={32} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">该会话暂无消息记录</p>
                  </div>
                ) : (
                  conversationData.messages.map((msg) => {
                    const isParent = msg.sender_role === 'parent';
                    const isTeacher = msg.sender_role === 'teacher';
                    const isAdvisor = msg.sender_role === 'advisor';
                    const isInternal = msg.visibility === 'internal';

                    const isPending = msg.relay_status === 'pending';
                    const isRepliedWaitingApproval = msg.relay_status === 'replied_by_teacher';
                    const isForwarded = msg.relay_status === 'forwarded_to_teacher';
                    const isPublished = msg.relay_status === 'published';

                    // 1. 内部备注
                    if (isInternal) {
                      return (
                        <div
                          key={msg.id}
                          className="bg-gray-100/90 border border-gray-300 rounded-xl p-4 text-gray-800 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="flex items-center gap-1.5 font-medium text-gray-700">
                              <Lock size={13} className="text-gray-500" />
                              <span>{msg.sender_name || 'Roger'} (内部备注)</span>
                              <Badge className="bg-gray-200 text-gray-700 text-[10px] px-1.5 py-0">
                                仅内部可见
                              </Badge>
                            </span>
                            <span>{formatTime(msg.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content_zh}</p>
                        </div>
                      );
                    }

                    // 2. 顾问直接回复
                    if (isAdvisor) {
                      return (
                        <div
                          key={msg.id}
                          className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs text-blue-900">
                            <span className="flex items-center gap-1.5 font-medium">
                              <span>💼 课程顾问 / 学管回复</span>
                              <Badge variant="success" className="text-[10px] px-1.5 py-0">
                                已发布给家长
                              </Badge>
                            </span>
                            <span className="text-blue-700">{formatTime(msg.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content_zh}</p>
                        </div>
                      );
                    }

                    // 3. 家长留言
                    if (isParent) {
                      const formState = actionForms[msg.id] || {
                        actionType: 'forward',
                        teacherId: activeStudent?.current_teacher_id || '',
                        contentEn: '',
                        contentZh: '',
                      };

                      return (
                        <div
                          key={msg.id}
                          className={`rounded-xl p-4 border transition-all ${
                            isPending
                              ? 'bg-amber-50/40 border-amber-300 shadow-sm ring-1 ring-amber-200'
                              : 'bg-white border-gray-200'
                          } space-y-3`}
                        >
                          {/* 头部信息 */}
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="flex items-center gap-1.5 font-medium text-gray-900">
                              <span>👨‍👩‍👦 家长留言 ({msg.sender_name || '家长'})</span>
                              {isPending && (
                                <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                                  待分流
                                </Badge>
                              )}
                              {isForwarded && (
                                <Badge variant="primary" className="text-[10px] px-1.5 py-0">
                                  已转交外教
                                </Badge>
                              )}
                              {isPublished && (
                                <Badge variant="success" className="text-[10px] px-1.5 py-0">
                                  已归档发布
                                </Badge>
                              )}
                            </span>
                            <span>{formatTime(msg.created_at)}</span>
                          </div>

                          {/* 家长中文留言内容 */}
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">
                            {msg.content_zh}
                          </div>

                          {/* 若已转交外教，显示手写英文翻译 */}
                          {msg.content_en && (
                            <div className="mt-2 p-2.5 bg-blue-50/60 rounded-lg border border-blue-100 text-xs space-y-1">
                              <div className="font-semibold text-blue-800 flex items-center gap-1">
                                <ArrowRight size={12} />
                                <span>外教阅读版 (手写英文翻译):</span>
                              </div>
                              <div className="text-gray-700 whitespace-pre-wrap">{msg.content_en}</div>
                            </div>
                          )}

                          {/* 待分流操作区 (转交外教 vs 直接回复) */}
                          {isPending && (
                            <div className="mt-3 pt-3 border-t border-amber-200/80 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-amber-900">
                                  分流处理方式:
                                </span>
                                <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateActionForm(msg.id, 'actionType', 'forward')
                                    }
                                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                                      formState.actionType === 'forward'
                                        ? 'bg-primary-500 text-white'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                  >
                                    转交外教
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateActionForm(msg.id, 'actionType', 'direct')
                                    }
                                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                                      formState.actionType === 'direct'
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                  >
                                    顾问直回
                                  </button>
                                </div>
                              </div>

                              {/* A: 转交外教表单 */}
                              {formState.actionType === 'forward' && (
                                <div className="space-y-2 bg-white/80 p-3 rounded-lg border border-amber-100">
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <label className="text-xs font-medium text-gray-700 sm:w-20">
                                      接收外教:
                                    </label>
                                    <select
                                      value={
                                        formState.teacherId !== undefined
                                          ? formState.teacherId
                                          : activeStudent?.current_teacher_id || ''
                                      }
                                      onChange={(e) =>
                                        updateActionForm(msg.id, 'teacherId', e.target.value)
                                      }
                                      className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white flex-1 focus:ring-1 focus:ring-primary-500"
                                    >
                                      <option value="">
                                        {activeStudent?.current_teacher_id
                                          ? `默认当前外教 (${activeStudent.current_teacher_name})`
                                          : '请选择外教...'}
                                      </option>
                                      {teachers.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name} (id: {t.id})
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700">
                                      手写英文翻译 (必填，转交给外教阅读):
                                    </label>
                                    <textarea
                                      rows={3}
                                      placeholder="请输入给外教看的英文内容 (content_en)..."
                                      value={formState.contentEn || ''}
                                      onChange={(e) =>
                                        updateActionForm(msg.id, 'contentEn', e.target.value)
                                      }
                                      className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                    />
                                  </div>

                                  <div className="flex justify-end">
                                    <Button
                                      size="sm"
                                      disabled={
                                        submitting[`forward_${msg.id}`] ||
                                        !(formState.contentEn || '').trim()
                                      }
                                      onClick={() =>
                                        handleForward(
                                          msg,
                                          activeStudent?.current_teacher_id ||
                                            conversationData?.conversation?.teacher_id
                                        )
                                      }
                                      className="flex items-center gap-1.5"
                                    >
                                      <Send size={13} />
                                      <span>
                                        {submitting[`forward_${msg.id}`]
                                          ? '转交中...'
                                          : '转交外教'}
                                      </span>
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* B: 顾问直接回复表单 */}
                              {formState.actionType === 'direct' && (
                                <div className="space-y-2 bg-white/80 p-3 rounded-lg border border-blue-100">
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700">
                                      中文直接回复家长 (必填，同时清除该会话全部 pending 待办):
                                    </label>
                                    <textarea
                                      rows={3}
                                      placeholder="请输入直接回复家长的中文内容 (content_zh)..."
                                      value={formState.contentZh || ''}
                                      onChange={(e) =>
                                        updateActionForm(msg.id, 'contentZh', e.target.value)
                                      }
                                      className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                  </div>

                                  <div className="flex justify-end">
                                    <Button
                                      size="sm"
                                      disabled={
                                        submitting[`direct_${msg.id}`] ||
                                        !(formState.contentZh || '').trim()
                                      }
                                      onClick={() => handleDirectReply(msg)}
                                      className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
                                    >
                                      <Send size={13} />
                                      <span>
                                        {submitting[`direct_${msg.id}`]
                                          ? '回复中...'
                                          : '直接回复家长'}
                                      </span>
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // 4. 外教回复
                    if (isTeacher) {
                      const formState = actionForms[msg.id] || { contentZh: '' };

                      return (
                        <div
                          key={msg.id}
                          className={`rounded-xl p-4 border transition-all ${
                            isRepliedWaitingApproval
                              ? 'bg-indigo-50/40 border-indigo-300 shadow-sm ring-1 ring-indigo-200'
                              : 'bg-white border-gray-200'
                          } space-y-3`}
                        >
                          {/* 头部信息 */}
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="flex items-center gap-1.5 font-medium text-indigo-900">
                              <span>👩‍🏫 外教回复 ({msg.sender_name || '外教'})</span>
                              {isRepliedWaitingApproval && (
                                <Badge variant="primary" className="text-[10px] px-1.5 py-0">
                                  待审核放行
                                </Badge>
                              )}
                              {isPublished && (
                                <Badge variant="success" className="text-[10px] px-1.5 py-0">
                                  已放行给家长
                                </Badge>
                              )}
                            </span>
                            <span>{formatTime(msg.replied_at || msg.created_at)}</span>
                          </div>

                          {/* 外教英文原文 */}
                          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm font-sans text-gray-800 whitespace-pre-wrap">
                            <div className="text-[11px] font-semibold text-gray-400 mb-1">
                              TEACHER REPLY (ENGLISH):
                            </div>
                            {msg.content_en}
                          </div>

                          {/* 已发布的中文放行版 */}
                          {isPublished && msg.content_zh && (
                            <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200 text-xs space-y-1">
                              <div className="font-semibold text-emerald-800">
                                家长端呈现版 (Roger 手写中文):
                              </div>
                              <div className="text-gray-800 whitespace-pre-wrap">
                                {msg.content_zh}
                              </div>
                            </div>
                          )}

                          {/* 审核放行表单 (仅在 replied_by_teacher 项上出现) */}
                          {isRepliedWaitingApproval && (
                            <div className="mt-3 pt-3 border-t border-indigo-200 space-y-2 bg-white/80 p-3 rounded-lg">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-indigo-950">
                                  手写中文翻译（选填，留空则直接用老师原文回复家长）:
                                </label>
                                <textarea
                                  rows={3}
                                  placeholder="请输入 Roger 手写的中文翻译内容 (content_zh)..."
                                  value={formState.contentZh || ''}
                                  onChange={(e) =>
                                    updateActionForm(msg.id, 'contentZh', e.target.value)
                                  }
                                  className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  disabled={submitting[`publish_${msg.id}`]}
                                  onClick={() => handlePublish(msg)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
                                >
                                  <CheckCircle2 size={13} />
                                  <span>
                                    {submitting[`publish_${msg.id}`]
                                      ? '放行中...'
                                      : '审核放行并通知家长'}
                                  </span>
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return null;
                  })
                )}
              </div>

              {/* 底部新增内部备注区域 */}
              <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                  <Lock size={13} className="text-gray-500" />
                  <span>添加内部备注 (仅管理端可见，家长和外教均不可见)</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <textarea
                    rows={2}
                    placeholder="输入内部备注内容（如续费跟进意向、排课沟通备忘录等）..."
                    value={internalNoteText}
                    onChange={(e) => setInternalNoteText(e.target.value)}
                    className="flex-1 text-xs border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={submitting.internalNote || !internalNoteText.trim()}
                    onClick={handleAddInternalNote}
                    className="sm:self-end flex items-center gap-1.5 text-xs"
                  >
                    <Lock size={12} />
                    <span>{submitting.internalNote ? '保存中...' : '保存内部备注'}</span>
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
