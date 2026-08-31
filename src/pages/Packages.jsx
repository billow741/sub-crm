import { useState, useEffect } from 'react';
import { Package, Plus, User, Calendar, Trash2, Search, ArrowUpRight, Clock, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { packageOps, studentOps, loadData } from '../store';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export default function Packages() {
  const [packages, setPackages] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    studentId: '',
    name: '',
    total: 20,
    price: '',
    expiryDate: '',
  });

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      const [pkgs, studs] = await Promise.all([
        packageOps.getAll(),
        studentOps.getAll()
      ]);
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setStudents(Array.isArray(studs) ? studs : []);
    } catch (err) {
      console.error('Load error:', err);
      setPackages([]);
      setStudents([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await packageOps.add({ ...formData, used: 0 });
    setShowModal(false);
    setFormData({ studentId: '', name: '', total: 20, price: '', expiryDate: '' });
    loadPackages();
  };

  const handleDelete = async (id) => {
    if (confirm('确定要删除该课时包吗？')) {
      await packageOps.delete(id);
      loadPackages();
    }
  };

  const getStudentName = (studentId) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || '未知学生';
  };

  const filteredPackages = packages.filter(pkg => {
    const studentName = getStudentName(pkg.studentId).toLowerCase();
    return studentName.includes(searchTerm.toLowerCase()) ||
      pkg.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalRemaining = packages.reduce((sum, p) => sum + (p.remaining || 0), 0);
  const totalValue = packages.reduce((sum, p) => sum + (p.price || 0), 0);

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl flex items-center justify-center text-primary-600 shadow-inner">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">课时包管理</h1>
            <p className="text-sm text-gray-500 font-medium">共 {packages.length} 个课时包</p>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowModal(true)}
          className="shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加课时包
        </Button>
      </div>

      {/* 统计指标 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">课时包总数</span>
              <Package className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-3xl font-black text-gray-900">{packages.length}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">剩余总课时</span>
              <Clock className="w-5 h-5 text-success-500" />
            </div>
            <div className="text-3xl font-black text-success-600">{totalRemaining.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">课时包总价值</span>
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold font-mono">¥</div>
            </div>
            <div className="text-3xl font-black text-blue-600">¥{totalValue.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索框 */}
      <Card className="overflow-hidden border-0 shadow-sm bg-white/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="搜索学生或课时包名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none transition-shadow text-sm font-medium"
            />
          </div>
        </CardContent>
      </Card>

      {/* 课时包列表 */}
      <div>
        {filteredPackages.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPackages.map(pkg => (
              <Card key={pkg.id} className="group overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border-gray-200">
                <CardContent className="p-0">
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <Link
                          to={`/students/${pkg.studentId}`}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-bold hover:bg-primary-100 transition-colors mb-2"
                        >
                          <User size={12} />
                          {getStudentName(pkg.studentId)}
                          <ArrowUpRight size={12} className="ml-0.5 opacity-50" />
                        </Link>
                        <h3 className="font-bold text-gray-900 leading-tight">{pkg.name}</h3>
                      </div>
                      <button
                        onClick={() => handleDelete(pkg.id)}
                        className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <div className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-xs font-bold text-gray-500">课时进度</span>
                        <div className="text-right">
                          <span className={`text-lg font-black ${pkg.remaining < 3 ? 'text-danger-600' : 'text-gray-900'}`}>
                            {pkg.remaining}
                          </span>
                          <span className="text-gray-400 text-xs font-medium ml-1">/ {pkg.total}</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ease-out ${
                            pkg.remaining < 3 ? 'bg-danger-500' : 'bg-success-500'
                          }`}
                          style={{ width: `${Math.max((pkg.remaining / pkg.total) * 100, 0)}%` }}
                        ></div>
                      </div>
                      {pkg.remaining < 3 && pkg.remaining > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-danger-600 font-bold">
                          <Info className="w-3 h-3" /> 余额不足，请提醒续费
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs font-medium border-t border-gray-100 pt-3">
                      {pkg.price ? (
                        <span className="text-gray-900 font-bold bg-gray-100 px-2 py-1 rounded">¥{pkg.price}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                      {pkg.expiryDate ? (
                        <span className="text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                          <Calendar size={12} className="text-gray-400" />
                          {pkg.expiryDate}到期
                        </span>
                      ) : (
                        <span className="text-gray-400">长期有效</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 border-dashed py-16 flex flex-col items-center justify-center text-gray-400 space-y-4 shadow-sm">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center shadow-inner">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium">{searchTerm ? '未找到匹配的课时包' : '暂无课时包数据'}</p>
          </div>
        )}
      </div>

      {/* 添加弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md shadow-2xl border-0 overflow-hidden">
            <CardHeader className="bg-white border-b border-gray-100 px-6 py-5">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-600" />
                新增课时包
              </h2>
            </CardHeader>
            <div className="p-6 bg-gray-50/50">
              <form id="packageForm" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">关联学生 <span className="text-danger-500">*</span></label>
                  <select
                    required
                    value={formData.studentId}
                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-bold"
                  >
                    <option value="">请选择学生</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">课时包名称 <span className="text-danger-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-medium"
                    placeholder="如：60节外教口语课"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">总课时数 <span className="text-danger-500">*</span></label>
                    <input
                      type="number" step="0.01"
                      required
                      min="0.1"
                      value={formData.total}
                      onChange={(e) => setFormData({ ...formData, total: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">总价格 (¥)</label>
                    <input
                      type="number" step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-bold text-success-700"
                      placeholder="选填"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">到期日期</label>
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-medium text-gray-600"
                  />
                </div>
              </form>
            </div>
            <div className="px-6 py-4 bg-white border-t border-gray-100 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                取消
              </Button>
              <Button type="submit" form="packageForm" variant="primary" className="px-6 shadow-sm">
                确认添加
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}