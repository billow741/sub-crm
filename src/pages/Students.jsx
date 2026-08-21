import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { studentOps } from '../store';
import OrgFilter from '../components/OrgFilter';
import { setSelectedOrg, organizationOps, getSelectedOrg, getUserRole } from '../store/api';

export default function Students() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrg, setSelectedOrgState] = useState('');
  const [showModal, setShowModal] = useState(searchParams.get('action') === 'add');
  const [editingStudent, setEditingStudent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    english_name: '',
    phone: '',
    email: '',
    age: '',
    grade: '',
    parentName: '',
    notes: '',
    organization_id: '',
  });

  // 加载机构列表（用于新增/编辑弹窗中的机构选择）
  useEffect(() => {
    if (orgs.length === 0) {
      organizationOps.getAll().then(data => setOrgs(data)).catch(() => {});
    }
  }, []);

  // orgId → orgName 映射
  const getOrgName = (orgId) => {
    if (!orgId) return '总部';
    const org = orgs.find(o => o.id === parseInt(orgId));
    return org ? org.name : '总部';
  };

  const loadStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (selectedOrg) params.org_id = selectedOrg;
      const result = await studentOps.getPaginated(1, 100, params);
      setStudents(result || []);
    } catch (error) {
      console.error('加载学生失败:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, selectedOrg]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const apiData = {
        name: formData.name,
        english_name: formData.english_name || null,
        phone: formData.phone || null,
        email: formData.email || null,
        age: formData.age ? parseInt(formData.age) : null,
        grade: formData.grade || null,
        parent_name: formData.parentName || null,
        notes: formData.notes || null,
        status: formData.status || 'active',
        organization_id: formData.organization_id ? parseInt(formData.organization_id) : (selectedOrg ? parseInt(selectedOrg) : 1),
      };
      
      if (editingStudent) {
        await studentOps.update(editingStudent.id, apiData);
      } else {
        await studentOps.add(apiData);
      }
      setShowModal(false);
      setEditingStudent(null);
      setFormData({ name: '', english_name: '', phone: '', email: '', age: '', grade: '', parentName: '', notes: '', status: 'active' });
      loadStudents();
    } catch (error) {
      console.error('保存学生失败:', error);
      alert('保存失败: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name || '',
      english_name: student.english_name || '',
      phone: student.phone || '',
      email: student.email || '',
      age: student.age || '',
      grade: student.grade || '',
      parentName: student.parent_name || student.parentName || '',
      notes: student.notes || '',
      status: student.status || 'active',
      organization_id: student.organization_id ? String(student.organization_id) : '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (confirm('确定要删除该学生吗？此操作不可恢复。')) {
      try {
        await studentOps.delete(id);
        loadStudents();
      } catch (error) {
        console.error('删除学生失败:', error);
        alert('删除失败: ' + error.message);
      }
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone?.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStudentRemaining = (student) => {
    // 优先使用后端返回的已四舍五入 remaining_hours，避免前端浮点数精度问题
    if (student.remaining_hours !== undefined && student.remaining_hours !== null) {
      return student.remaining_hours;
    }
    // 兼容旧数据：回退计算并四舍五入到 2 位小数
    return Math.round(((student.total_hours || 0) - (student.used_hours || 0)) * 100) / 100;
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">学生管理</h1>
          <p className="text-gray-500 mt-1">共 {students.length} 名学生</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus size={20} /> 添加学生
        </button>
      </div>
      {/* 搜索筛选 */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="搜索学生姓名或电话..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <OrgFilter selectedOrg={selectedOrg} onChange={(orgId) => { setSelectedOrgState(orgId); setSelectedOrg(orgId); }} />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">全部状态</option>
          <option value="active">学习中</option>
          <option value="inactive">已暂停</option>
          <option value="graduated">已结课</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-4 font-medium text-gray-500">学生信息</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">所属机构</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">联系方式</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">剩余课时</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">状态</th>
                <th className="text-left px-6 py-4 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => {
                  const remaining = getStudentRemaining(student);
                  return (
                    <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <Link to={`/students/${student.id}`} className="flex items-center gap-3 hover:text-primary-600">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-700 font-medium">
                              {student.name?.charAt(0) || '学'}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium text-gray-800">{student.name}</div>
                            {student.english_name && <div className="text-sm text-gray-400">{student.english_name}</div>}
                            <div className="text-sm text-gray-500">
                              {student.grade && `等级: ${student.grade}`}
                              {student.age && ` | 年龄: ${student.age}`}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {getOrgName(student.organization_id)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600">{student.phone}</div>
                        {student.email && <div className="text-sm text-gray-400">{student.email}</div>}
                        {(student.parent_name || student.parentName) && (
                          <div className="text-sm text-gray-400">家长: {student.parent_name || student.parentName}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-semibold ${
                          remaining < 3 ? 'text-red-500' : remaining < 10 ? 'text-orange-500' : 'text-green-500'
                        }`}>
                          {remaining} 节
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          student.status === 'active' ? 'bg-green-100 text-green-700' :
                          student.status === 'inactive' ? 'bg-gray-100 text-gray-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {student.status === 'active' ? '学习中' : student.status === 'inactive' ? '已暂停' : '已结课'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(student)}
                            className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(student.id)}
                            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    {searchTerm ? '未找到匹配的学生' : '暂无学生数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">
              {editingStudent ? '编辑学生' : '添加学生'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">英文名 *</label>
                <input
                  type="text"
                  required
                  value={formData.english_name}
                  onChange={(e) => setFormData({ ...formData, english_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="如：Alice"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
                  <input
                    type="number"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">等级</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">请选择等级</option>
                    <option value="Pre-A1">Pre-A1</option>
                    <option value="A1">A1</option>
                    <option value="A2">A2</option>
                    <option value="B1">B1</option>
                    <option value="B2">B2</option>
                    <option value="C1">C1</option>
                    <option value="C2">C2</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="active">学习中</option>
                    <option value="inactive">已暂停</option>
                    <option value="graduated">已结课</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">家长姓名</label>
                <input
                  type="text"
                  value={formData.parentName}
                  onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {/* 所属机构选择 - super_admin 可选，普通用户自动锁定 */}
              {orgs.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">所属机构</label>
                  <select
                    value={formData.organization_id}
                    onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">请选择机构</option>
                    {orgs.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingStudent(null);
                    setFormData({ name: '', english_name: '', phone: '', email: '', age: '', grade: '', parentName: '', notes: '', status: 'active', organization_id: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> 保存中...
                    </span>
                  ) : (
                    editingStudent ? '保存' : '添加'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
