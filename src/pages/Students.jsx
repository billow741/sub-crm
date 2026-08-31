import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Trash2, Loader2, User } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { studentOps } from '../store';
import OrgFilter from '../components/OrgFilter';
import { setSelectedOrg, organizationOps, getSelectedOrg, getUserRole } from '../store/api';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

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
    gender: '',
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
      setStudents(Array.isArray(result) ? result : (result?.data || []));
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
        gender: formData.gender || null,
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
      setFormData({ name: '', english_name: '', gender: '', phone: '', email: '', age: '', grade: '', parentName: '', notes: '', status: 'active', organization_id: '' });
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
      gender: student.gender || '',
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
    const pwd = window.prompt('【高危操作】删除学生将导致所有关联记录消失！\n请输入授权密码 "DELETE" 确认删除：');
    if (pwd !== 'DELETE') {
      if (pwd !== null) alert('密码错误，取消删除。');
      return;
    }
    try {
      await studentOps.delete(id);
      loadStudents();
    } catch (error) {
      console.error('删除学生失败:', error);
      alert('删除失败: ' + error.message);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone?.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStudentRemaining = (student) => {
    if (student.remaining_hours !== undefined && student.remaining_hours !== null) {
      return Math.round(parseFloat(student.remaining_hours) * 100) / 100;
    }
    return Math.round(((parseFloat(student.total_hours) || 0) - (parseFloat(student.used_hours) || 0)) * 100) / 100;
  };

  const getGenderBadge = (gender) => {
    if (gender === '男' || gender === 'male') return <Badge variant="primary">男</Badge>;
    if (gender === '女' || gender === 'female') return <Badge variant="danger" className="bg-pink-50 text-pink-700">女</Badge>;
    if (gender) return <Badge variant="default">{gender}</Badge>;
    return null;
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">学生管理</h1>
          <p className="text-gray-500 mt-1">共 {students.length} 名学生</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="w-full sm:w-auto">
          <Plus size={20} className="mr-2" aria-hidden="true" /> 
          添加学生
        </Button>
      </div>

      {/* 搜索筛选 */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} aria-hidden="true" />
          <input
            type="text"
            placeholder="搜索学生姓名或电话..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <OrgFilter 
            selectedOrg={selectedOrg} 
            onChange={(orgId) => { setSelectedOrgState(orgId); setSelectedOrg(orgId); }} 
            className="w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow bg-white"
          >
            <option value="all">全部状态</option>
            <option value="active">学习中</option>
            <option value="inactive">已暂停</option>
            <option value="graduated">已结课</option>
          </select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center space-x-4">
                <div className="rounded-full bg-gray-200 h-10 w-10"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm sm:text-base whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 md:px-6 py-4 font-medium text-gray-500">学生信息</th>
                  <th className="text-left px-4 md:px-6 py-4 font-medium text-gray-500 hidden md:table-cell">所属机构</th>
                  <th className="text-left px-4 md:px-6 py-4 font-medium text-gray-500">联系方式</th>
                  <th className="text-left px-4 md:px-6 py-4 font-medium text-gray-500">剩余课时</th>
                  <th className="text-left px-4 md:px-6 py-4 font-medium text-gray-500">状态</th>
                  <th className="text-right px-4 md:px-6 py-4 font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => {
                    const remaining = getStudentRemaining(student);
                    return (
                      <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 md:px-6 py-4">
                          <Link 
                            to={`/students/${student.id}`} 
                            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg p-1 -ml-1"
                          >
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center shrink-0 border border-primary-200/50 group-hover:bg-primary-200 transition-colors">
                              <span className="text-primary-700 font-medium">
                                {student.name?.charAt(0) || '学'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-800 flex items-center gap-2 group-hover:text-primary-600 transition-colors">
                                <span className="truncate">{student.name}</span>
                                {getGenderBadge(student.gender)}
                              </div>
                              {student.english_name && <div className="text-sm text-gray-400 truncate">{student.english_name}</div>}
                              <div className="text-xs md:text-sm text-gray-500 flex gap-2">
                                {student.grade && <span>等级: {student.grade}</span>}
                                {student.age && <span>年龄: {student.age}岁</span>}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 md:px-6 py-4 hidden md:table-cell">
                          <Badge variant="primary" className="bg-indigo-50 text-indigo-700">
                            {getOrgName(student.organization_id)}
                          </Badge>
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <div className="text-gray-600">{student.phone}</div>
                          {student.email && <div className="text-xs text-gray-400 truncate max-w-[150px]" title={student.email}>{student.email}</div>}
                          {(student.parent_name || student.parentName) && (
                            <div className="text-xs text-gray-500 mt-0.5">家长: {student.parent_name || student.parentName}</div>
                          )}
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <span className={`font-semibold ${
                            remaining < 3 ? 'text-danger-500' : remaining < 10 ? 'text-warning-500' : 'text-success-600'
                          }`}>
                            {remaining} 节
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-4">
                          <Badge variant={
                            student.status === 'active' ? 'success' :
                            student.status === 'inactive' ? 'default' :
                            'primary'
                          }>
                            {student.status === 'active' ? '学习中' : student.status === 'inactive' ? '已暂停' : '已结课'}
                          </Badge>
                        </td>
                        <td className="px-4 md:px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(student)}
                              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                              aria-label="编辑学生"
                            >
                              <Edit size={18} aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => handleDelete(student.id)}
                              className="p-2 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
                              aria-label="删除学生"
                            >
                              <Trash2 size={18} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center justify-center">
                        <User size={48} className="mb-4 text-gray-300" aria-hidden="true" />
                        <p>{searchTerm ? '未找到匹配的学生' : '暂无学生数据'}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 弹窗部分可稍后进一步封装 Modal 组件，此处先优化基础样式 */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-semibold text-gray-800">
                {editingStudent ? '编辑学生' : '添加学生'}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
              >
                关闭
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="student-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">英文名 *</label>
                    <input
                      type="text"
                      required
                      value={formData.english_name}
                      onChange={(e) => setFormData({ ...formData, english_name: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                      placeholder="如：Alice"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">性别</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="">请选择性别</option>
                      <option value="男">男</option>
                      <option value="女">女</option>
                      <option value="保密">保密</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
                    <input
                      type="number"
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="如：7"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">电话</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">等级</label>
                    <select
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
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
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="active">学习中</option>
                      <option value="inactive">已暂停</option>
                      <option value="graduated">已结课</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">家长姓名</label>
                  <input
                    type="text"
                    value={formData.parentName}
                    onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>
                
                {orgs.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">所属机构</label>
                    <select
                      value={formData.organization_id}
                      onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="">请选择机构</option>
                      {orgs.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
              <Button 
                variant="outline"
                className="flex-1 bg-white"
                onClick={() => {
                  setShowModal(false);
                  setEditingStudent(null);
                  setFormData({ name: '', english_name: '', phone: '', email: '', age: '', grade: '', parentName: '', notes: '', status: 'active', organization_id: '' });
                }}
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                form="student-form"
                className="flex-1"
                disabled={submitting}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> 保存中...
                  </span>
                ) : (
                  editingStudent ? '保存' : '添加'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
