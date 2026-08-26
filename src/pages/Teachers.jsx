import { useState, useEffect } from 'react';
import { User, Plus, Edit2, Trash2, Phone, Mail, BookOpen, Search, ExternalLink, Share2, Lock, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { teacherOps } from '../store';
import { teacherPaymentOps } from '../store/api';
import OrgFilter from '../components/OrgFilter';
import { setSelectedOrg, organizationOps } from '../store/api';
import TeacherPayments from './TeacherPayments';

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
      const filterOrg = orgId !== null ? orgId : selectedOrg;
      const params = filterOrg ? { org_id: filterOrg } : {};
      const data = await teacherOps.getAll(params);
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Load error:', err);
      setTeachers([]);
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
      // 至少选一个机构
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

      // 如果就一个机构，也设置旧字段兼容
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
    const pwd = window.prompt('【高危操作】删除教师将导致关联课程和薪资数据消失！\\n请输入授权密码 "DELETE" 确认删除：');
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
      const API_BASE = 'https://api.changtian.dpdns.org/api/v1';
      const res = await fetch(`${API_BASE}/settings/verify-teacher-payment-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
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
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          教师列表
        </button>
        <button
          onClick={() => handleTabChange('payments')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
            activeTab === 'payments'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <DollarSign className="w-4 h-4"/>
          薪资结算
          {passwordVerified && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">已解锁</span>}
        </button>
      </div>

      {activeTab === 'list' ? (
        <>
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">教师管理</h1>
        <button
          onClick={() => {
            setEditingTeacher(null);
            setFormData({
              name: '', phone: '', email: '', subjects: '', hourly_rate: '',
              status: 'active', notes: '', organization_ids: []
            });
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          添加教师
        </button>
      </div>

      {/* 搜索框 + 机构筛选 */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="搜索教师姓名、电话、邮箱..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <OrgFilter selectedOrg={selectedOrg} onChange={(orgId) => { setSelectedOrgState(orgId); setSelectedOrg(orgId); loadTeachers(orgId); }} />
      </div>

      {/* 在职教师 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">在职教师 ({activeTeachers.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeTeachers.map(teacher => (
            <TeacherCard key={teacher.id} teacher={teacher} onEdit={handleEdit} onDelete={handleDelete} orgs={orgs} />
          ))}
        </div>
        {activeTeachers.length === 0 && (
          <p className="text-gray-500 text-center py-8">暂无在职教师</p>
        )}
      </div>

      {/* 离职教师 */}
      {inactiveTeachers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-400 mb-3">离职教师 ({inactiveTeachers.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
            {inactiveTeachers.map(teacher => (
              <TeacherCard key={teacher.id} teacher={teacher} onEdit={handleEdit} onDelete={handleDelete} orgs={orgs} />
            ))}
          </div>
        </div>
      )}

      {/* 添加/编辑弹窗 */}
        </>
      ) : (
        <TeacherPayments />
      )}

      {/* 密码验证弹窗 */}
      {showPasswordModal && (
        <div className="fixed top-0 left-0 w-full h-full bg-black flex items-center justify-center z-50" style={{ minHeight: '100vh' }}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold">输入密码</h2>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              查看薪资结算需要密码验证
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
              placeholder="请输入密码"
              className="w-full px-4 py-2 border rounded-lg mb-2 focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {passwordError && (
              <p className="text-red-500 text-sm mb-3">{passwordError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleClosePasswordModal}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={verifyPassword}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                验证
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editingTeacher ? '编辑教师' : '添加教师'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">可授科目（逗号分隔）</label>
                <input
                  type="text"
                  value={formData.subjects}
                  onChange={(e) => setFormData({ ...formData, subjects: e.target.value })}
                  placeholder="例如: 英语, 数学, 物理"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">在职</option>
                  <option value="inactive">离职</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 所属机构 — 多选 checkbox */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  所属机构 <span className="text-red-500">*</span>
                  <span className="text-xs text-gray-400 ml-2">（可多选，教师将出现在所选机构的排课中）</span>
                </label>
                <div className="flex flex-wrap gap-3 p-3 border rounded-lg bg-gray-50">
                  {orgs.map(org => {
                    const checked = formData.organization_ids.includes(parseInt(org.id));
                    return (
                      <label
                        key={org.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer border transition-colors ${
                          checked
                            ? 'bg-blue-100 border-blue-400 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOrg(org.id)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-sm font-medium">{org.name}</span>
                      </label>
                    );
                  })}
                  {orgs.length === 0 && (
                    <span className="text-gray-400 text-sm">加载机构中...</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  保存
                </button>
              </div>
            </form>
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
  const API_BASE = 'https://api.changtian.dpdns.org/api/v1';

  const handleGenerateShareLink = async () => {
    try {
      const res = await fetch(`${API_BASE}/teacher/share/${teacher.id}/generate-token`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.data?.token) {
        const url = `${window.location.origin}/teacher/share/${data.data.token}`;
        setShareUrl(url);
        navigator.clipboard.writeText(url);
        alert('分享链接已复制到剪贴板！\n\n链接：' + url);
      }
    } catch (err) {
      alert('生成失败：' + err.message);
    }
  };

  const orgNames = getOrgNames();

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold">{teacher.name}</h3>
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                teacher.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {teacher.status === 'active' ? '在职' : '离职'}
              </span>
              {orgNames.map((name, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-1">
          {/* 分享链接按钮 */}
          <button
            onClick={handleGenerateShareLink}
            className="p-1 hover:bg-green-100 rounded"
            title="生成分享链接"
          >
            <Share2 className="w-4 h-4 text-green-500" />
          </button>

          {/* 教师门户链接 */}
          <Link
            to={`/teacher/${teacher.id}`}
            className="p-1 hover:bg-purple-100 rounded"
            title="教师门户"
          >
            <ExternalLink className="w-4 h-4 text-purple-500" />
          </Link>

          {/* 编辑按钮 */}
          <button
            onClick={() => onEdit(teacher)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>

          {/* 删除按钮 */}
          <button
            onClick={() => onDelete(teacher.id)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600">
        {teacher.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            <span>{teacher.phone}</span>
          </div>
        )}
        {teacher.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            <span>{teacher.email}</span>
          </div>
        )}
        {teacher.subjects?.length > 0 && (
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            <span>{teacher.subjects.join(', ')}</span>
          </div>
        )}
      </div>

      {teacher.notes && (
        <p className="mt-2 text-sm text-gray-500 truncate">{teacher.notes}</p>
      )}
    </div>
  );
}
