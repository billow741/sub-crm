import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Trash2, CheckCircle, Clock, XCircle, Building2, Copy, Plus, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { teacherOps, studentOps, classOps } from '../store';
import OrgFilter from '../components/OrgFilter';
import TeacherFilter from '../components/TeacherFilter';
import CopyWeekModal from '../components/CopyWeekModal';
import { setSelectedOrg, organizationOps } from '../store/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

// 时长(分钟) → 后端根据系数自动计算课时，前端只传 duration
// 此函数仅用于前端显示和课时充足检查的预估
const COEFFICIENT = 0.66; // 默认系数，API会根据机构配置实际计算
function durationToHours(duration) {
  if (duration === 25) return COEFFICIENT;
  if (duration === 50 || duration === 60) return 1.0;
  // 其他时长默认按1课时
  return 1.0;
}

const DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00'
];

// 根据课程状态获取样式
const getStatusStyle = (status) => {
  switch (status) {
    case 'completed':
      return { 
        bg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/80', 
        text: 'text-emerald-800', 
        subtext: 'text-emerald-600',
        icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" /> 
      };
    case 'scheduled':
      return { 
        bg: 'bg-primary-50 border-primary-200 hover:bg-primary-100/80', 
        text: 'text-primary-900', 
        subtext: 'text-primary-600',
        icon: <Clock className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" /> 
      };
    case 'cancelled':
      return { 
        bg: 'bg-rose-50 border-rose-200 hover:bg-rose-100/80', 
        text: 'text-rose-800', 
        subtext: 'text-rose-600',
        icon: <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" /> 
      };
    default:
      return { 
        bg: 'bg-gray-50 border-gray-200 hover:bg-gray-100', 
        text: 'text-gray-800', 
        subtext: 'text-gray-500',
        icon: <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" /> 
      };
  }
};

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [selectedOrg, setSelectedOrgState] = useState('');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState(new Set());
  const [orgs, setOrgs] = useState([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyData, setCopyData] = useState(null);
  const [formData, setFormData] = useState({
    student_id: '',
    teacher_id: '',
    date: '',
    time: '10:00',
    duration: 50,
    subject: '英语',
    notes: '',
    is_trial: false,
    organization_id: ''
  });

  // 加载机构列表
  useEffect(() => {
    organizationOps.getAll().then(data => setOrgs(data)).catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = selectedOrg ? { org_id: selectedOrg } : {};
      const [teachersData, studentsData] = await Promise.all([
        teacherOps.getAll(params),
        studentOps.getAll(params)
      ]);
      setTeachers(Array.isArray(teachersData) ? teachersData.filter(t => t.status === 'active') : []);
      setStudents(Array.isArray(studentsData) ? studentsData.filter(s => s.status === 'active') : []);

      const classesData = await classOps.getAll(params);
      // 加载所有状态的课程（包括已完成的）
      const allClasses = Array.isArray(classesData) ? classesData : [];
      setSchedules(allClasses);
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [currentDate, selectedOrg]);

  // 当 teachers 加载完后,默认全选(让用户看到所有老师的课)
  useEffect(() => {
    if (teachers.length > 0 && selectedTeacherIds.size === 0) {
      setSelectedTeacherIds(new Set(teachers.map(t => t.id)));
    }
  }, [teachers]);

  const getTwoWeeks = () => {
    const weeks = [];
    for (let w = 0; w < 2; w++) {
      const week = [];
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + (w * 7));
      for (let d = 0; d < 7; d++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + d);
        week.push(date);
      }
      weeks.push(week);
    }
    return weeks;
  };

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (date) => {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // 根据当前弹窗选择的机构获取学生/教师
  const getFilteredStudents = () => {
    if (!formData.organization_id) return [];
    const orgId = parseInt(formData.organization_id);
    return students.filter(s => {
      const sOrg = s.organization_id || s.organization_ids?.[0]
      return sOrg === orgId
    });
  };

  const getFilteredTeachers = () => {
    if (!formData.organization_id) return [];
    const orgId = parseInt(formData.organization_id);
    return teachers.filter(t => {
      const orgIds = t.organization_ids || (t.organization_id ? [t.organization_id] : []);
      return orgIds.includes(orgId);
    });
  };

  // 排除当前选中的日期/时间段有冲突的老师
  const getAvailableTeachers = () => {
    const filtered = getFilteredTeachers();
    if (!formData.date || !formData.time) return filtered;
    // 防御：time 必须是 'HH:MM' 格式字符串
    if (typeof formData.time !== 'string' || !formData.time.includes(':')) return filtered;
    // 计算结束时间
    const [h, m] = formData.time.split(':').map(Number);
    const totalMinutes = h * 60 + m + formData.duration;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    return filtered.filter(t => {
      const hasConflict = schedules.some(s => {
        if (editingSchedule && s.id === editingSchedule.id) return false;
        if (s.teacher_id !== t.id || s.date !== formData.date || s.status === 'cancelled') return false;
        if (!s.start_time || !s.end_time) return false;
        return formData.time < s.end_time && endTime > s.start_time;
      });
      return !hasConflict;
    });
  };

  const handleSlotClick = (date, time) => {
    setFormData({
      student_id: '',
      teacher_id: '',
      date: formatDateKey(date),
      time: time,
      duration: 50,
      subject: '英语',
      notes: '',
      is_trial: false,
      organization_id: ''
    });
    setEditingSchedule(null);
    setShowModal(true);
  };

  const handleEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    // 从课程的学生反查机构
    const matchedStudent = students.find(s => s.id === schedule.student_id);
    const orgId = matchedStudent?.organization_id || matchedStudent?.organization_ids?.[0] || '';
    
    // 优先用 duration，若无则智能从 hours 或起止时间推算
    let duration = schedule.duration;
    if (!duration) {
      if (schedule.hours && parseFloat(schedule.hours) <= 0.75) {
        duration = 25;
      } else if (schedule.start_time && schedule.end_time) {
        const [sh, sm] = schedule.start_time.split(':').map(Number);
        const [eh, em] = schedule.end_time.split(':').map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        duration = (diff > 0 && diff <= 35) ? 25 : (diff > 0 ? diff : 50);
      } else {
        duration = 50;
      }
    }

    setFormData({
      student_id: schedule.student_id?.toString() || '',
      teacher_id: schedule.teacher_id?.toString() || '',
      date: schedule.date,
      time: schedule.start_time || '10:00',
      duration: duration,
      subject: schedule.subject || '英语',
      notes: schedule.notes || '',
      is_trial: schedule.is_trial ? true : false,
      organization_id: orgId ? String(orgId) : ''
    });
    setShowModal(true);
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('确定要删除这节课吗？')) return;
    try {
      await classOps.delete(scheduleId);
      loadData();
    } catch (err) {
      alert('删除失败：' + err.message);
    }
  };

  // 打开复制 modal:计算源周(上周)和目标周(本周),拉取两边的课
  // 周定义:周日到周六(本周末是周六,下个新一周从周日开始)
  // 例:今天 8-24(周一),本周 = 8-23(周日) ~ 8-29(周六),上周 = 8-16 ~ 8-22
  const handleOpenCopyModal = async () => {
    const currentWeekStart = new Date(currentDate);
    currentWeekStart.setDate(currentDate.getDate() - currentDate.getDay()); // 本周日

    const sourceWeekStart = new Date(currentWeekStart);
    sourceWeekStart.setDate(sourceWeekStart.getDate() - 7);
    const sourceWeekEnd = new Date(sourceWeekStart);
    sourceWeekEnd.setDate(sourceWeekEnd.getDate() + 6);

    const targetWeekStart = currentWeekStart;
    const targetWeekEnd = new Date(currentWeekStart);
    targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);

    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    try {
      const params = selectedOrg ? { org_id: selectedOrg } : {};
      // 后端不直接支持 date_from/date_to,前端用 page_size=1000 拉所有,然后本地过滤
      const allSchedules = await classOps.getAll({ ...params });
      const inRange = (date) => date >= fmt(sourceWeekStart) && date <= fmt(sourceWeekEnd);
      const inTargetRange = (date) => date >= fmt(targetWeekStart) && date <= fmt(targetWeekEnd);

      const sourceSchedules = (allSchedules || []).filter(s => inRange(s.date));
      const targetSchedules = (allSchedules || []).filter(s => inTargetRange(s.date));

      setCopyData({
        sourceSchedules,
        targetSchedules,
        sourceWeekLabel: `${fmt(sourceWeekStart)} ~ ${fmt(sourceWeekEnd)}`,
        targetWeekLabel: `${fmt(targetWeekStart)} ~ ${fmt(targetWeekEnd)}`
      });
      setShowCopyModal(true);
    } catch (err) {
      alert('加载排课失败: ' + err.message);
    }
  };

  // 确认复制:对每条预览的课循环 POST
  const handleCopyConfirm = async (previewList, onProgress) => {
    let done = 0;
    const errors = [];

    for (const item of previewList) {
      // 找到源课,基于它创建新课
      const source = copyData.sourceSchedules.find(s => s.id === item.source_id);
      if (!source) {
        errors.push(`源课 ${item.source_id} 找不到`);
        continue;
      }

      // 计算时长与结束时间
      const [sh, sm] = (source.start_time || '00:00').split(':').map(Number);
      let duration = source.duration;
      if (!duration) {
        if (source.hours && parseFloat(source.hours) <= 0.75) {
          duration = 25;
        } else if (source.start_time && source.end_time) {
          const [esh, esm] = source.start_time.split(':').map(Number);
          const [eeh, eem] = source.end_time.split(':').map(Number);
          const diff = (eeh * 60 + eem) - (esh * 60 + esm);
          duration = (diff > 0 && diff <= 35) ? 25 : (diff > 0 ? diff : 50);
        } else {
          duration = 50;
        }
      }
      const totalMin = sh * 60 + sm + duration;
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      const newClass = {
        student_id: source.student_id,
        teacher_id: source.teacher_id,
        teacher: source.teacher_name || source.teacher || '',
        date: item.new_date,
        start_time: source.start_time,
        end_time: endTime,
        hours: durationToHours(duration),
        duration: duration,
        subject: source.subject || '英语',
        notes: source.notes || '',
        is_trial: source.is_trial || 0,
        status: 'scheduled',
        organization_id: source.organization_id
      };

      try {
        await classOps.add(newClass.student_id, newClass);
        done++;
        if (onProgress) onProgress(done);
      } catch (err) {
        errors.push(`${source.student_name || source.student_id} ${item.new_date}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      alert(`复制完成,${done} 条成功,${errors.length} 条失败:\n\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...还有 ${errors.length - 5} 条` : ''}`);
    } else {
      alert(`✅ 成功复制 ${done} 条排课`);
    }
    loadData();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // 计算结束时间
      const [hours, minutes] = formData.time.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + formData.duration;
      const endHours = Math.floor(totalMinutes / 60) % 24;
      const endMinutes = totalMinutes % 60;
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
      
      // ── 前端老师时间冲突检查（提前拦截，给更好体验）──
      if (formData.teacher_id) {
        const teacherId = parseInt(formData.teacher_id);
        const conflicts = schedules.filter(s => {
          // 编辑时排除自己
          if (editingSchedule && s.id === editingSchedule.id) return false;
          // 同一老师、同一日期、非取消状态
          if (s.teacher_id !== teacherId || s.date !== formData.date || s.status === 'cancelled') return false;
          // 时间区间重叠：start < otherEnd && end > otherStart
          if (!s.start_time || !s.end_time) return false;
          return formData.time < s.end_time && endTime > s.start_time;
        });
        if (conflicts.length > 0) {
          const conflictNames = conflicts.map(c => getStudentName(c.student_id)).join('、');
          alert(`⚠️ 教师时间冲突！\n\n该教师 ${formData.date} ${formData.time}-${endTime} 已有课程：\n${conflictNames}\n\n请选择其他时间或教师。`);
          return;
        }
      }
      
      const scheduleData = {
        student_id: formData.student_id ? parseInt(formData.student_id) : null,
        teacher_id: formData.teacher_id ? parseInt(formData.teacher_id) : null,
        teacher: teachers.find(t => t.id === parseInt(formData.teacher_id))?.name || '',
        date: formData.date,
        start_time: formData.time,
        end_time: endTime,
        hours: durationToHours(formData.duration),
        duration: formData.duration ? parseInt(formData.duration) : 50,
        subject: formData.subject,
        notes: formData.notes,
        is_trial: formData.is_trial ? 1 : 0,
        status: 'scheduled',
        organization_id: formData.organization_id ? parseInt(formData.organization_id) : null
      };
      
      if (editingSchedule) {
        await classOps.update(editingSchedule.id, scheduleData);
      } else {
        if (!scheduleData.student_id) {
          alert('请选择学生');
          return;
        }
        await classOps.add(scheduleData.student_id, scheduleData);
      }
      
      setShowModal(false);
      setEditingSchedule(null);
      loadData();
    } catch (err) {
      // 后端冲突拦截（409）
      const msg = err?.message || '';
      if (msg.includes('TEACHER_CONFLICT') || msg.includes('教师时间冲突')) {
        alert(msg.replace('TEACHER_CONFLICT: ', '').replace('TEACHER_CONFLICT', ''));
      } else {
        alert('保存失败：' + msg);
      }
    }
  };

  const getSchedulesForSlot = (dateKey, time) => {
    // 模糊匹配：找到该时间段内的课程
    return schedules.filter(s => {
      if (s.date !== dateKey) return false;
      // 防御：start_time 必须存在
      if (!s.start_time || typeof s.start_time !== 'string') return false;
      // 老师过滤(0 = 全部不显示,等于 teachers.length = 全部显示)
      if (selectedTeacherIds.size > 0 && selectedTeacherIds.size < teachers.length
          && !selectedTeacherIds.has(s.teacher_id)) {
        return false;
      }
      // 精确匹配
      if (s.start_time === time) return true;
      // 如果课程时间不在标准时间槽，显示在最接近的时间槽
      const slotMinutes = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]);
      const startMinutes = parseInt(s.start_time.split(':')[0]) * 60 + parseInt(s.start_time.split(':')[1]);
      // 30分钟范围内都显示在这个槽
      return startMinutes >= slotMinutes && startMinutes < slotMinutes + 60;
    });
  };

  const getStudentName = (id) => {
    if (!id) return '未知学生';
    const student = students.find(s => s.id === parseInt(id) || s.id === id);
    if (!student) return '未知学生';
    return student.english_name ? `${student.name} (${student.english_name})` : student.name;
  };

  const getTeacherName = (id) => {
    if (!id) return '未知教师';
    const teacher = teachers.find(t => t.id === parseInt(id) || t.id === id);
    return teacher?.name || '未知教师';
  };

  const weeks = getTwoWeeks();

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-4 md:p-6 max-w-full mx-auto">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <div className="h-8 w-48 bg-gray-200 rounded-lg"></div>
          <div className="h-8 w-64 bg-gray-200 rounded-lg"></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 h-[600px] p-4 flex flex-col gap-4">
          <div className="h-10 bg-gray-100 rounded-lg"></div>
          <div className="flex-1 grid grid-cols-8 gap-2">
            {[...Array(24)].map((_, i) => (
              <div key={i} className="bg-gray-50 rounded-lg border border-gray-100"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full">
      {/* 顶部控制栏 */}
      <div className="sticky top-0 z-30 bg-gray-50/90 backdrop-blur-md pb-2 pt-1">
        <Card className="p-3.5 shadow-sm border-gray-200/80">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">排课管理</h1>
              <OrgFilter selectedOrg={selectedOrg} onChange={(orgId) => { setSelectedOrgState(orgId); setSelectedOrg(orgId); }} />
              <TeacherFilter
                teachers={teachers}
                selectedIds={selectedTeacherIds}
                onChange={setSelectedTeacherIds}
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200/60">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleToday}
                  className="text-xs h-7 px-2.5 hover:bg-white rounded"
                >
                  今天
                </Button>
                <button
                  onClick={handlePrevWeek}
                  className="p-1 hover:bg-white text-gray-600 rounded transition-colors"
                  title="上一周"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextWeek}
                  className="p-1 hover:bg-white text-gray-600 rounded transition-colors"
                  title="下一周"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">
                <CalendarIcon className="w-3.5 h-3.5 text-primary-500" />
                <span>
                  {weeks[0][0].toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ~ {weeks[1][6].toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                </span>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenCopyModal}
                className="h-8 gap-1.5 text-primary-700 bg-primary-50/50 border-primary-200 hover:bg-primary-100 text-xs"
                title="复制上周排课到本周"
              >
                <Copy className="w-3.5 h-3.5" />
                复制上周
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* 日历主网格 */}
      <Card className="overflow-hidden border-gray-200 shadow-sm flex flex-col" style={{ maxHeight: 'calc(100vh - 170px)' }}>
        <div className="overflow-auto flex-1">
          <div className="min-w-[1400px]">
            {/* 表头 — sticky 在日历顶部 */}
            <div className="grid grid-cols-[70px_repeat(14,minmax(90px,1fr))] border-b border-gray-200 sticky top-0 z-20 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="p-3 text-center text-xs font-semibold text-gray-500 border-r border-gray-200 bg-gray-50 sticky left-0 z-10 flex items-center justify-center">
                时间
              </div>
              {weeks.map((week, weekIdx) => (
                week.map((date, dayIdx) => {
                  const today = isToday(date);
                  return (
                    <div
                      key={`${weekIdx}-${dayIdx}`}
                      className={`p-2.5 text-center border-r border-gray-100 last:border-r-0 transition-colors ${
                        today ? 'bg-primary-50/70' : weekIdx === 1 && dayIdx === 0 ? 'bg-gray-50/50' : 'bg-white'
                      }`}
                    >
                      <div className={`text-[11px] font-medium ${today ? 'text-primary-600 font-bold' : 'text-gray-400'}`}>
                        {DAYS[date.getDay()]}
                      </div>
                      <div className={`font-bold text-base mt-0.5 ${today ? 'text-primary-700' : 'text-gray-800'}`}>
                        {date.getDate()}
                      </div>
                    </div>
                  );
                })
              ))}
            </div>

            {/* 时间行 */}
            {TIME_SLOTS.map(time => (
              <div key={time} className="grid grid-cols-[70px_repeat(14,minmax(90px,1fr))] border-b border-gray-100 hover:bg-gray-50/40 transition-colors">
                <div className="p-2 text-center text-xs text-gray-500 font-medium border-r border-gray-200 bg-gray-50 sticky left-0 z-10 flex items-center justify-center">
                  {time}
                </div>
                {weeks.map((week, weekIdx) => (
                  week.map((date, dayIdx) => {
                    const dateKey = formatDateKey(date);
                    const slotSchedules = getSchedulesForSlot(dateKey, time);
                    const today = isToday(date);
                    return (
                      <div
                        key={`${weekIdx}-${dayIdx}-${time}`}
                        onClick={() => handleSlotClick(date, time)}
                        className={`min-h-[72px] p-1.5 border-r border-gray-100 last:border-r-0 cursor-pointer relative flex flex-col gap-1 transition-colors ${
                          today ? 'bg-primary-50/15 hover:bg-primary-50/30' : 'hover:bg-gray-50'
                        }`}
                      >
                        {slotSchedules.map(schedule => {
                          const statusStyle = getStatusStyle(schedule.status);
                          return (
                            <div
                              key={schedule.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditSchedule(schedule);
                              }}
                              className={`${statusStyle.bg} border text-xs p-1.5 rounded-lg mb-0.5 shadow-xs hover:shadow-sm transition-all group relative ${
                                schedule.is_trial ? 'ring-1.5 ring-amber-400' : ''
                              }`}
                            >
                              {schedule.is_trial === 1 && (
                                <span className="absolute -top-1.5 -right-1 text-[9px] bg-amber-500 text-white font-bold rounded-full px-1 shadow-xs leading-tight">
                                  试听
                                </span>
                              )}
                              <div className="flex items-center gap-1">
                                {statusStyle.icon}
                                <div className={`font-semibold truncate ${statusStyle.text}`}>
                                  {getStudentName(schedule.student_id)}
                                </div>
                              </div>
                              <div className={`truncate ml-4.5 text-[11px] font-medium ${statusStyle.subtext}`}>
                                {schedule.teacher_name || getTeacherName(schedule.teacher_id)}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSchedule(schedule.id);
                                }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 bg-rose-500 text-white rounded hover:bg-rose-600 transition-opacity shadow-xs"
                                title="删除此排课"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 添加/编辑排课弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-gray-800">
                {editingSchedule ? '编辑排课' : '添加排课'}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                关闭
              </button>
            </div>

            <form id="schedule-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* 所属机构 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属机构 *</label>
                <select
                  value={formData.organization_id}
                  onChange={(e) => setFormData({ ...formData, organization_id: e.target.value, student_id: '', teacher_id: '' })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  required
                >
                  <option value="">选择机构</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">学生 *</label>
                <select
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  required
                  disabled={!formData.organization_id}
                >
                  <option value="">选择学生</option>
                  {getFilteredStudents().map(s => (
                    <option key={s.id} value={s.id}>{s.english_name ? `${s.name} (${s.english_name})` : s.name}</option>
                  ))}
                </select>
                {!formData.organization_id && (
                  <p className="text-xs text-gray-400 mt-1">请先选择所属机构</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">教师 *</label>
                <select
                  value={formData.teacher_id}
                  onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  required
                  disabled={!formData.organization_id}
                >
                  <option value="">选择教师</option>
                  {getAvailableTeachers().map(t => (
                    <option key={t.id} value={t.id}>{t.name} ✓</option>
                  ))}
                  {/* 有冲突的老师灰色显示，不可选 */}
                  {formData.date && formData.time && getFilteredTeachers()
                    .filter(t => !getAvailableTeachers().some(a => a.id === t.id))
                    .map(t => (
                      <option key={t.id} value={t.id} disabled className="text-gray-300">
                        {t.name} ✗冲突
                      </option>
                    ))}
                </select>
                {!formData.organization_id && (
                  <p className="text-xs text-gray-400 mt-1">请先选择所属机构</p>
                )}
                {formData.date && formData.time && getFilteredTeachers().length > 0 && getAvailableTeachers().length === 0 && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">⚠️ 该时间段所有教师都有冲突</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">日期 *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">时间 *</label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">时长（分钟）</label>
                  <select
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value), is_trial: parseInt(e.target.value) === 25 ? formData.is_trial : false })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value={25}>25分钟 (0.66课时)</option>
                    <option value={50}>50分钟 (1课时)</option>
                    <option value={60}>60分钟</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">科目</label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="英语"
                  />
                </div>
              </div>

              {formData.duration === 25 && (
                <div className="flex items-center gap-2 bg-amber-50/80 border border-amber-200 rounded-lg px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={formData.is_trial}
                    onChange={(e) => setFormData({ ...formData, is_trial: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                    id="is-trial"
                  />
                  <label htmlFor="is-trial" className="text-sm text-amber-800 font-medium cursor-pointer">
                    🎁 体验课（25分钟免费试听）
                  </label>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder="添加排课备注信息..."
                />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 bg-white"
              >
                取消
              </Button>
              <Button
                type="submit"
                form="schedule-form"
                className="flex-1"
              >
                保存
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 复制上周到本周 modal */}
      {showCopyModal && copyData && (
        <CopyWeekModal
          isOpen={showCopyModal}
          onClose={() => setShowCopyModal(false)}
          teachers={teachers}
          sourceSchedules={copyData.sourceSchedules}
          targetSchedules={copyData.targetSchedules}
          sourceWeekLabel={copyData.sourceWeekLabel}
          targetWeekLabel={copyData.targetWeekLabel}
          onConfirm={handleCopyConfirm}
        />
      )}
    </div>
  );
}
