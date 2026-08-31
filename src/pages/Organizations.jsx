import { useState, useEffect } from 'react';
import { Plus, Building2, Users, Phone, Mail, MapPin, Search, Edit2, Trash2, X, GraduationCap, Clock } from 'lucide-react';
import { organizationOps } from '../store/api';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

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
      setFormData({ name: '', contact_name: '', contact_phone: '', contact_email: '', address: '', notes: '', login_code: '', password: '', unit_price_cny: '', unit_price_25_cny: '', short_class_coefficient: '' });
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
    setFormData({ name: '', contact_name: '', contact_phone: '', contact_email: '', address: '', notes: '', login_code: '', password: '', unit_price_cny: '', unit_price_25_cny: '', short_class_coefficient: '' });
    setShowModal(true);
  };

  if (loading) return (
    <div className="flex h-[200px] items-center justify-center text-gray-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mr-2"></div>
      加载中...
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">机构管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理合作机构及其结算配置</p>
        </div>
        <Button onClick={handleAdd} className="shadow-sm">
          <Plus className="w-5 h-5 mr-1" /> 新增机构
        </Button>
      </div>

      <div className="mb-6 flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索机构名称或联系人..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white shadow-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium text-lg mb-1">暂无机构数据</p>
          <p className="text-gray-400 text-sm">点击右上角"新增机构"添加第一家合作机构</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(org => (
            <Card key={org.id} className="flex flex-col hover:shadow-lg transition-all duration-200 hover:-translate-y-1 group border-gray-200">
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl flex items-center justify-center shrink-0 border border-primary-100/50">
                      <Building2 className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 line-clamp-1" title={org.name}>{org.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>ID: {org.id}</span>
                        {org.login_code && (
                          <Badge variant={org.has_password ? "success" : "warning"} className="px-1.5 py-0 text-[10px]">
                            {org.has_password ? '已开通系统' : '无密码'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(org)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(org)} className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-md transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 text-sm mb-4">
                  {org.contact_name && (
                    <div className="flex items-center gap-2.5 text-gray-600">
                      <Users className="w-4 h-4 text-gray-400 shrink-0" /> <span className="font-medium text-gray-700">{org.contact_name}</span>
                    </div>
                  )}
                  {org.contact_phone && (
                    <div className="flex items-center gap-2.5 text-gray-600">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" /> <span>{org.contact_phone}</span>
                    </div>
                  )}
                  {org.contact_email && (
                    <div className="flex items-center gap-2.5 text-gray-600">
                      <Mail className="w-4 h-4 text-gray-400 shrink-0" /> <span className="truncate">{org.contact_email}</span>
                    </div>
                  )}
                  {org.address && (
                    <div className="flex items-start gap-2.5 text-gray-600">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" /> <span className="line-clamp-2 leading-relaxed">{org.address}</span>
                    </div>
                  )}
                </div>

                {org.notes && (
                  <div className="mt-4 p-3 bg-gray-50/80 rounded-lg">
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{org.notes}</p>
                  </div>
                )}
              </div>
              
              {/* Card Footer: Metrics */}
              <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-100 flex flex-col gap-2 rounded-b-xl">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4 text-gray-600">
                    <span className="flex items-center gap-1.5" title="学生数"><GraduationCap className="w-3.5 h-3.5 text-gray-400" /> {org.student_count || 0}</span>
                    <span className="flex items-center gap-1.5" title="教师数"><Users className="w-3.5 h-3.5 text-gray-400" /> {org.teacher_count || 0}</span>
                    <span className="flex items-center gap-1.5" title="课程数"><Clock className="w-3.5 h-3.5 text-gray-400" /> {org.class_count || 0}</span>
                  </div>
                </div>
                {(org.unit_price_cny || org.unit_price_25_cny) && (
                  <div className="text-xs text-gray-500 font-medium">
                    单价: <span className="text-primary-600">¥{org.unit_price_cny || '—'}</span> (50m) / <span className="text-orange-600">¥{org.unit_price_25_cny || '—'}</span> (25m)
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl border-0">
            <CardHeader className="shrink-0 flex items-center justify-between border-b border-gray-100 bg-white rounded-t-xl px-6 py-4">
              <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                <Building2 className="w-5 h-5 text-primary-500" />
                {editingOrg ? '编辑机构信息' : '新增合作机构'}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)} className="w-8 h-8 p-0 rounded-full text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                
                {/* 基本信息区 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <span className="w-1.5 h-4 bg-blue-500 rounded-full"></span>
                    <h3 className="font-semibold text-gray-800 text-sm">基本信息</h3>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">机构名称 <span className="text-danger-500">*</span></label>
                    <input
                      type="text" required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                      placeholder="例如：SunnyBridge 英语中心"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                      <input
                        type="text"
                        value={formData.contact_name}
                        onChange={e => setFormData({...formData, contact_name: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                      <input
                        type="text"
                        value={formData.contact_phone}
                        onChange={e => setFormData({...formData, contact_phone: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">联系邮箱</label>
                    <input
                      type="email"
                      value={formData.contact_email}
                      onChange={e => setFormData({...formData, contact_email: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">备注说明</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* 结算与财务 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <span className="w-1.5 h-4 bg-orange-400 rounded-full"></span>
                    <h3 className="font-semibold text-gray-800 text-sm">财务与结算配置</h3>
                  </div>
                  <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100/50 grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">50分钟课单价 (¥)</label>
                      <input
                        type="number" step="0.01"
                        value={formData.unit_price_cny}
                        onChange={e => setFormData({...formData, unit_price_cny: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="例如: 80"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">25分钟课单价 (¥)</label>
                      <input
                        type="number" step="0.01"
                        value={formData.unit_price_25_cny}
                        onChange={e => setFormData({...formData, unit_price_25_cny: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                        placeholder="例如: 50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">扣课时系数</label>
                      <input
                        type="number" step="0.01" min="0.01" max="1"
                        value={formData.short_class_coefficient}
                        onChange={e => setFormData({...formData, short_class_coefficient: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        placeholder="例如: 0.66"
                      />
                    </div>
                    <div className="col-span-3 text-xs text-gray-500 mt-1">
                      <span className="text-gray-400">提示: </span> 留空则使用系统全局配置，填 0 强制重置。
                    </div>
                  </div>
                </div>

                {/* 机构端账号 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <span className="w-1.5 h-4 bg-purple-500 rounded-full"></span>
                    <h3 className="font-semibold text-gray-800 text-sm">机构端登录账号 (可选)</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">登录代码 (Login Code)</label>
                      <input
                        type="text"
                        value={formData.login_code}
                        onChange={e => setFormData({...formData, login_code: e.target.value.toLowerCase().trim()})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="小写字母/数字，如: sunny"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between">
                        <span>登录密码</span>
                        {editingOrg && <span className="text-xs text-gray-400 font-normal">留空表示不修改</span>}
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder={editingOrg ? '输入新密码覆盖旧密码' : '设置初始登录密码'}
                      />
                    </div>
                  </div>
                </div>

              </div>

              <div className="flex justify-end gap-3 p-5 border-t border-gray-100 bg-gray-50 shrink-0 rounded-b-xl">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? '保存中...' : '确认保存'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
