import { useState, useEffect } from 'react';
import { Plus, Building2, Users, Phone, Mail, MapPin, Search, Edit2, Trash2, X } from 'lucide-react';
import { organizationOps } from '../store/api';

export default function Organizations() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [formData, setFormData] = useState({
    name: '', contact_name: '', contact_phone: '', contact_email: '', address: '', notes: '', login_code: '', password: '',
    unit_price_cny: '', unit_price_25_cny: '', short_class_coefficient: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchOrgs(); }, []);

  const fetchOrgs = async () => {
    try {
      const data = await organizationOps.getAll();
      setOrganizations(data);
    } catch (e) {
      console.error('获取机构列表失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = organizations.filter(o =>
    o.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const submitData = { ...formData };
      // 数值字段转float或null
      submitData.unit_price_cny = (formData.unit_price_cny !== '' && formData.unit_price_cny !== null) ? parseFloat(formData.unit_price_cny) : null;
      submitData.unit_price_25_cny = (formData.unit_price_25_cny !== '' && formData.unit_price_25_cny !== null) ? parseFloat(formData.unit_price_25_cny) : null;
      submitData.short_class_coefficient = (formData.short_class_coefficient !== '' && formData.short_class_coefficient !== null) ? parseFloat(formData.short_class_coefficient) : null;
      if (editingOrg) {
        await organizationOps.update(editingOrg.id, submitData);
      } else {
        await organizationOps.add(submitData);
      }
      setShowModal(false);
      setEditingOrg(null);
      setFormData({ name: '', contact_name: '', contact_phone: '', contact_email: '', address: '', notes: '', login_code: '', password: '',
        unit_price_cny: '', unit_price_25_cny: '', short_class_coefficient: '' });
      fetchOrgs();
    } catch (e) {
      console.error('保存机构失败:', e);
      alert('保存失败: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (org) => {
    setEditingOrg(org);
    setFormData({
      name: org.name || '', contact_name: org.contact_name || '',
      contact_phone: org.contact_phone || '', contact_email: org.contact_email || '',
      address: org.address || '', notes: org.notes || '',
      login_code: org.login_code || '', password: '',
      unit_price_cny: org.unit_price_cny ?? '', unit_price_25_cny: org.unit_price_25_cny ?? '',
      short_class_coefficient: org.short_class_coefficient ?? ''
    });
    setShowModal(true);
  };

  const handleDelete = async (org) => {
    if (!confirm(`确定要删除「${org.name}」吗？此操作不可撤销。`)) return;
    try {
      await organizationOps.delete(org.id);
      fetchOrgs();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const handleAdd = () => {
    setEditingOrg(null);
    setFormData({ name: '', contact_name: '', contact_phone: '', contact_email: '', address: '', notes: '', login_code: '', password: '',
      unit_price_cny: '', unit_price_25_cny: '', short_class_coefficient: '' });
    setShowModal(true);
  };

  if (loading) return <div className="p-6 text-gray-500">加载中...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">机构管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理合作机构信息</p>
        </div>
        <button onClick={handleAdd} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
          <Plus size={20} /> 新增机构
        </button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索机构名称或联系人..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border rounded-lg w-80 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Building2 size={48} className="mx-auto mb-4 opacity-50" />
          <p>暂无机构数据</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(org => (
            <div key={org.id} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <Building2 size={20} className="text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{org.name}</h3>
                    <p className="text-xs text-gray-400">ID: {org.id}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(org)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(org)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {org.contact_name && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Users size={14} /> <span>{org.contact_name}</span>
                  </div>
                )}
                {org.contact_phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone size={14} /> <span>{org.contact_phone}</span>
                  </div>
                )}
                {org.contact_email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail size={14} /> <span className="truncate">{org.contact_email}</span>
                  </div>
                )}
                {org.address && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <MapPin size={14} /> <span>{org.address}</span>
                  </div>
                )}
              </div>

              {org.notes && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400">{org.notes}</p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4 text-xs text-gray-500">
                <span>学生: {org.student_count || 0}</span>
                <span>教师: {org.teacher_count || 0}</span>
                <span>课程: {org.class_count || 0}</span>
                {(org.unit_price_cny || org.unit_price_25_cny) && (
                  <span className="text-gray-400">
                    单价: 50min ¥{org.unit_price_cny || '—'} / 25min ¥{org.unit_price_25_cny || '—'}
                  </span>
                )}
                {org.login_code && (
                  <span className="ml-auto text-primary-500">
                    {org.has_password ? '🔑 已设登录' : '⚠️ 未设密码'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            {/* sticky header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-bold">{editingOrg ? '编辑机构' : '新增机构'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              {/* 滚动 body */}
              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">机构名称 *</label>
                  <input
                    type="text" required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={e => setFormData({...formData, contact_name: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                    <input
                      type="text"
                      value={formData.contact_phone}
                      onChange={e => setFormData({...formData, contact_phone: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">联系邮箱</label>
                    <input
                      type="email"
                      value={formData.contact_email}
                      onChange={e => setFormData({...formData, contact_email: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {/* 结算单价配置 */}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-400 mb-3">结算单价配置（可选）</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">50分钟单价（¥）</label>
                    <input
                      type="number" step="0.01"
                      value={formData.unit_price_cny}
                      onChange={e => setFormData({...formData, unit_price_cny: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="80"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">25分钟单价（¥）</label>
                    <input
                      type="number" step="0.01"
                      value={formData.unit_price_25_cny}
                      onChange={e => setFormData({...formData, unit_price_25_cny: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">课时系数</label>
                    <input
                      type="number" step="0.01" min="0.01" max="1"
                      value={formData.short_class_coefficient}
                      onChange={e => setFormData({...formData, short_class_coefficient: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="0.66"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400">留空则使用全局系数设置。空=不覆盖，0=重置为全局值。</p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {/* 机构登录 */}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-400 mb-3">机构端登录设置（可选）</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">登录代码</label>
                    <input
                      type="text"
                      value={formData.login_code}
                      onChange={e => setFormData({...formData, login_code: e.target.value.toLowerCase().trim()})}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="如：sunnybridge"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      密码 {editingOrg && <span className="text-xs text-gray-400">（留空=不修改）</span>}
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder={editingOrg ? '输入新密码修改' : '设置登录密码'}
                    />
                  </div>
                </div>
              </div>

              {/* sticky footer */}
              <div className="flex justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                  取消
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
