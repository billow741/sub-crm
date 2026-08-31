import { useState, useEffect } from 'react';
import { User, Plus, Edit2, Trash2, Phone, Mail, BookOpen, Search, ExternalLink, Share2, Lock, DollarSign, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { teacherOps } from '../store';
import { teacherPaymentOps } from '../store/api';
import OrgFilter from '../components/OrgFilter';
import { setSelectedOrg, organizationOps, API_BASE_URL, request } from '../store/api';
import TeacherPayments from './TeacherPayments';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrgState] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [activeTab, setActiveTab] = useState('list');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    subjects: '',
    hourly_rate: '',
    status: 'active',
    notes: '',
    organization_ids: []
  });

  useEffect(() => {
    loadTeachers();
    if (orgs.length === 0) {
      organizationOps.getAll().then(data => setOrgs(data)).catch(() => {});
    }
  }, []);

  const loadTeachers = async (orgId = null) => {
    try {
      setLoading(true);
      const filterOrg = orgId !== null ? orgId : selectedOrg;
      const params = filterOrg ? { org_id: filterOrg } : {};
      const data = await teacherOps.getAll(params);
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Load error:', err);
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  // 机构多选切换
  const toggleOrg = (orgId) => {
    const id = parseInt(orgId);
    setFormData(prev => {
      const current = prev.organization_ids || [];
      if (current.includes(id)) {
        return { ...prev, organization_ids: current.filter(x => x !== id) };
      } else {
        return { ...prev, organization_ids: [...current, id] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!formData.organization_ids || formData.organization_ids.length === 0) {
        alert('请至少选择一个所属机构');
        return;
      }

      const teacherData = {
        ...formData,
        subjects: formData.subjects.split(',').map(s => s.trim()).filter(Boolean),
        hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
        organization_ids: formData.organization_ids.map(id => parseInt(id))
      };

      teacherData.organization_id = teacherData.organization_ids[0];

      if (editingTeacher) {
        await teacherOps.update(editingTeacher.id, teacherData);
      } else {
        await teacherOps.add(teacherData);
      }

      setShowModal(false);
      setEditingTeacher(null);
      setFormData({
        name: '', phone: '', email: '', subjects: '', hourly_rate: '',
        status: 'active', notes: '', organization_ids: []
      });
      loadTeachers();
    } catch (err) {
      alert('保存失败：' + err.message);
    }
  };

  const handleEdit = (teacher) => {
    setEditingTeacher(teacher);
    const orgIds = teacher.organization_ids || (teacher.organization_id ? [teacher.organization_id] : []);
    setFormData({
      name: teacher.name,
      phone: teacher.phone || '',
      email: teacher.email || '',
      subjects: (teacher.subjects || []).join(', '),
      hourly_rate: teacher.hourly_rate || '',
      status: teacher.status,
      notes: teacher.notes || '',
      organization_ids: orgIds.map(id => parseInt(id))
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    const pwd = window.prompt('【高危操作】删除教师将导致关联课程和薪资数据消失！\n请输入授权密码 "DELETE" 确认删除：');
    if (pwd !== 'DELETE') {
      if (pwd !== null) alert('密码错误，取消删除。');
      return;
    }
    try {
      await teacherOps.delete(id);
      loadTeachers();
    } catch (err) {
      alert('删除失败：' + err.message);
    }
  };

  const filteredTeachers = teachers.filter(t =>
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.phone?.includes(searchTerm) ||
    t.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeTeachers = filteredTeachers.filter(t => t.status === 'active');
  const inactiveTeachers = filteredTeachers.filter(t => t.status === 'inactive');

  const handleTabChange = (tab) => {
    if (tab === 'payments' && !passwordVerified) {
      setShowPasswordModal(true);
      document.body.style.overflow = 'hidden';
    }
    setActiveTab(tab);
  };

  const verifyPassword = async () => {
    try {
      const data = await request('/settings/verify-teacher-payment-password', {
        method: 'POST',
        body: { password }
      });
      if (data.success || data.data?.valid) {
        setPasswordVerified(true);
        setShowPasswordModal(false);
        document.body.style.overflow = '';
        setPassword('');
        setPasswordError('');
      } else {
        setPasswordError('密码错误，请重试');
      }
    } catch (err) {
      setPasswordError('验证失败：' + err.message);
    }
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    document.body.style.overflow = '';
    setPassword('');
    setPasswordError('');
    if (activeTab === 'payments') {
      setActiveTab('list');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* 顶部选项卡切换 */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'list'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <User className="w-4 h-4" />
            教师列表
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {teachers.length}
            </span>
          </button>
          <button
            onClick={() => handleTabChange('payments')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            薪资结算
            {passwordVerified ? (
              <Badge variant="success" size="sm">已解锁</Badge>
            ) : (
              <Lock className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {activeTab === 'list' ? (
        <>
          {/* 标题和操作 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">教师管理</h1>
              <p className="text-sm text-gray-500 mt-1">管理中外教教师信息、授课权限与独立工作台分享</p>
            </div>
            <Button
              onClick={() => {
                setEditingTeacher(null);
                setFormData({
                  name: '', phone: '', email: '', subjects: '', hourly_rate: '',
                  status: 'active', notes: '', organization_ids: []
                });
                setShowModal(true);
              }}
              className="gap-2 self-start sm:self-auto shadow-sm"
            >
              <Plus className="w-4 h-4" />
              添加教师
            </Button>
          </div>

          {/* 搜索框 + 机构筛选 */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="搜索教师姓名、电话、邮箱..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="shrink-0">
                <OrgFilter 
                  selectedOrg={selectedOrg} 
                  onChange={(orgId) => { 
                    setSelectedOrgState(orgId); 
                    setSelectedOrg(orgId); 
                    loadTeachers(orgId); 
                  }} 
                />
              </div>
            </div>
          </Card>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 h-44"></div>
              ))}
            </div>
          ) : (
            <>
              {/* 在职教师 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">在职教师</h2>
                  <Badge variant="success">{activeTeachers.length}</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeTeachers.map(teacher => (
                    <TeacherCard key={teacher.id} teacher={teacher} onEdit={handleEdit} onDelete={handleDelete} orgs={orgs} />
                  ))}
                </div>
                {activeTeachers.length === 0 && (
                  <Card className="p-8 text-center text-gray-400">
                    暂无匹配的在职教师
                  </Card>
                )}
              </div>

              {/* 离职教师 */}
              {inactiveTeachers.length > 0 && (
                <div className="space-y-3 pt-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-400">离职教师</h2>
                    <Badge variant="default">{inactiveTeachers.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-75">
                    {inactiveTeachers.map(teacher => (
                      <TeacherCard key={teacher.id} teacher={teacher} onEdit={handleEdit} onDelete={handleDelete} orgs={orgs} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <TeacherPayments />
      )}

      {/* 密码验证弹窗 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 pb-2">
              <div className="flex items-center gap-2 mb-2 text-primary-600">
                <div className="p-2 bg-primary-50 rounded-lg">
                  <Lock className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">薪资权限验证</h2>
              </div>
              <p className="text-gray-500 text-xs mt-1">
                查看教师薪资结算记录属于敏感财务操作，请输入授权密码：
              </p>
            </div>

            <div className="p-6 pt-3 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
                placeholder="请输入授权密码"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                autoFocus
              />
              {passwordError && (
                <p className="text-rose-500 text-xs font-medium">{passwordError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
              <Button
                variant="outline"
                onClick={handleClosePasswordModal}
                className="flex-1 bg-white"
              >
                取消
              </Button>
              <Button
                onClick={verifyPassword}
                className="flex-1"
              >
                确认验证
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 添加/编辑教师弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-gray-800">
                {editingTeacher ? '编辑教师资料' : '添加新教师'}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                关闭
              </button>
            </div>

            <form id="teacher-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">教师姓名 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="如：Sarah Teacher"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="手机号"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">电子邮箱</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">可授科目（英文逗号分隔）</label>
                <input
                  type="text"
                  value={formData.subjects}
                  onChange={(e) => setFormData({ ...formData, subjects: e.target.value })}
                  placeholder="例如: 少儿英语, 自然拼读, 口语"
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">在职状态</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="active">在职</option>
                    <option value="inactive">离职</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">课时底薪标准</label>
                  <input
                    type="number"
                    value={formData.hourly_rate}
                    onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="¥ / 课时"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注说明</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder="教学特长、可用时间段等备注..."
                />
              </div>

              {/* 所属机构 — 多选 checkbox */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  所属授课校区 / 机构 <span className="text-rose-500">*</span>
                  <span className="text-xs text-gray-400 font-normal ml-2">（教师将出现在所选机构的排课选项中）</span>
                </label>
                <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50/50">
                  {orgs.map(org => {
                    const checked = formData.organization_ids.includes(parseInt(org.id));
                    return (
                      <label
                        key={org.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer border text-xs font-medium transition-all ${
                          checked
                            ? 'bg-primary-50 border-primary-300 text-primary-700 shadow-xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOrg(org.id)}
                          className="w-3.5 h-3.5 accent-primary-600 rounded"
                        />
                        <span>{org.name}</span>
                      </label>
                    );
                  })}
                  {orgs.length === 0 && (
                    <span className="text-gray-400 text-xs">加载机构中...</span>
                  )}
                </div>
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
                form="teacher-form"
                className="flex-1"
              >
                保存教师
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherCard({ teacher, onEdit, onDelete, orgs }) {
  const getOrgNames = () => {
    const ids = teacher.organization_ids || (teacher.organization_id ? [teacher.organization_id] : [1]);
    return ids.map(id => {
      const org = orgs?.find(o => o.id === id || o.id === parseInt(id));
      return org ? org.name : '总部';
    });
  };

  const [shareUrl, setShareUrl] = useState(null);

  const handleGenerateShareLink = async () => {
    try {
      const data = await request(`/teacher/share/${teacher.id}/generate-token`, {
        method: 'POST'
      });
      if (data.data?.token) {
        const url = `${window.location.origin}/teacher/share/${data.data.token}`;
        setShareUrl(url);
        navigator.clipboard.writeText(url);
        alert('分享链接已复制到剪贴板！');
      }
    } catch (e) {
      alert('生成分享链接失败');
    }
  };

  const orgNames = getOrgNames();

  return (
    <Card className="p-4 hover:shadow-md transition-shadow relative group">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center font-bold text-sm">
            {teacher.name ? teacher.name.slice(0, 2).toUpperCase() : <User className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">{teacher.name}</h3>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <Badge variant={teacher.status === 'active' ? 'success' : 'default'} size="sm">
                {teacher.status === 'active' ? '在职' : '离职'}
              </Badge>
              {orgNames.map((name, i) => (
                <Badge key={i} variant="primary" size="sm">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* 分享链接按钮 */}
          <button
            onClick={handleGenerateShareLink}
            className="p-1.5 hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 rounded-lg transition-colors"
            title="生成无密码课表分享链接"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          {/* 教师门户链接 */}
          <Link
            to={`/teacher/${teacher.id}`}
            className="p-1.5 hover:bg-primary-50 text-gray-400 hover:text-primary-600 rounded-lg transition-colors"
            title="打开教师独立工作台"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>

          {/* 编辑按钮 */}
          <button
            onClick={() => onEdit(teacher)}
            className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
            title="编辑"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          {/* 删除按钮 */}
          <button
            onClick={() => onDelete(teacher.id)}
            className="p-1.5 hover:bg-rose-50 text-gray-400 hover:text-rose-600 rounded-lg transition-colors"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-gray-500 pt-2 border-t border-gray-100">
        {teacher.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-gray-400" />
            <span>{teacher.phone}</span>
          </div>
        )}
        {teacher.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-gray-400" />
            <span className="truncate">{teacher.email}</span>
          </div>
        )}
        {teacher.subjects?.length > 0 && (
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-gray-400" />
            <span className="truncate">{teacher.subjects.join(', ')}</span>
          </div>
        )}
      </div>

      {teacher.notes && (
        <p className="mt-2 text-xs text-gray-400 bg-gray-50 p-2 rounded line-clamp-1">
          {teacher.notes}
        </p>
      )}
    </Card>
  );
}
