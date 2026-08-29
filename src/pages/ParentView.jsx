import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User, Calendar, Package, Clock, BookOpen, AlertCircle, X, ZoomIn } from 'lucide-react';
import { studentOps, packageOps, classOps, loadData, API_BASE_URL } from '../store';

// 家长端 - 通过学生ID或手机号查询
function ParentLookup() {
  const [searchType, setSearchType] = useState('id'); // 'id' or 'phone'
  const [searchValue, setSearchValue] = useState('');
  const [error, setError] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    setError('');
    
    const data = loadData();
    let student = null;
    
    if (searchType === 'id') {
      student = data.students.find(s => s.id === searchValue.trim());
    } else {
      student = data.students.find(s => s.phone === searchValue.trim());
    }
    
    if (student) {
      window.location.href = `/parent/${student.id}`;
    } else {
      setError('未找到该学生信息，请检查输入是否正确');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">家长访问</h1>
          <p className="text-gray-500 mt-2">查看孩子学习进度与上课记录</p>
        </div>

        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setSearchType('id')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                searchType === 'id' 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              学生ID
            </button>
            <button
              type="button"
              onClick={() => setSearchType('phone')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                searchType === 'phone' 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              手机号
            </button>
          </div>

          <div>
            <input
              type={searchType === 'id' ? 'text' : 'tel'}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={searchType === 'id' ? '请输入学生ID' : '请输入手机号'}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
          >
            查询
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400">
          <p>如有问题请联系老师获取学生ID</p>
        </div>
      </div>
    </div>
  );
}

function ParentStudentView() {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [packages, setPackages] = useState([]);
  const [classes, setClasses] = useState([]);
  const [previewImg, setPreviewImg] = useState(null);

  useEffect(() => {
    loadData();
    const s = studentOps.getById(studentId);
    if (s) {
      setStudent(s);
      setPackages(packageOps.getByStudent(studentId));
      setClasses(classOps.getByStudent(studentId));
    }
  }, [studentId]);

  if (!student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">未找到学生</h1>
          <p className="text-gray-500 mb-6">请检查学生ID是否正确</p>
          <Link
            to="/parent"
            className="inline-block px-6 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
          >
            返回查询
          </Link>
        </div>
      </div>
    );
  }

  // 计算课时统计
  const totalPurchased = packages.reduce((sum, p) => sum + (parseFloat(p.totalHours) || 0), 0);
  const totalRemaining = packages.reduce((sum, p) => sum + (parseFloat(p.remainingHours) || 0), 0);
  const usedHours = totalPurchased - totalRemaining;
  const completionRate = totalPurchased > 0 ? Math.round((usedHours / totalPurchased) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-6">
        <div className="max-w-2xl mx-auto">
          <Link to="/parent" className="text-white/80 hover:text-white text-sm flex items-center gap-1 mb-4">
            ← 重新查询
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold">{student.name?.charAt(0) || '学'}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">{student.name}</h1>
              <div className="text-white/80 text-sm mt-1">
                {student.gender && `性别: ${student.gender === 'male' ? '男' : student.gender === 'female' ? '女' : student.gender} · `}
                {student.age && `年龄: ${student.age}岁 · `}
                {student.grade && `等级: ${student.grade}`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* 学习进度卡片 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-orange-500" />
            学习进度
          </h2>
          
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">已完成</span>
              <span className="font-medium text-orange-600">{completionRate}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div 
                className="h-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-xl font-bold text-orange-600">{usedHours}</div>
              <div className="text-xs text-gray-500">已上课时</div>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <div className="text-xl font-bold text-amber-600">{totalRemaining}</div>
              <div className="text-xs text-gray-500">剩余课时</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-xl font-bold text-green-600">{classes.length}</div>
              <div className="text-xs text-gray-500">上课次数</div>
            </div>
          </div>
        </div>

        {/* 课时包状态 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" />
            课时包状态
          </h2>
          
          <div className="space-y-3">
            {packages.map((pkg) => (
              <div 
                key={pkg.id}
                className="p-4 border border-gray-100 rounded-lg flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-gray-800">{pkg.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    购买日期: {pkg.purchaseDate || '-'} · 有效期至: {pkg.expiryDate || '-'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-orange-600">
                    {pkg.remainingHours} / {pkg.totalHours} 课时
                  </div>
                  <div className={`text-xs px-2 py-0.5 rounded-full inline-block mt-1 ${
                    pkg.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {pkg.status === 'active' ? '使用中' : '已结课'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 最近上课记录 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-500" />
            最近上课记录
          </h2>
          
          {classes.length > 0 ? (
            <div className="space-y-4">
              {classes.slice(0, 10).map((cls) => (
                <div 
                  key={cls.id}
                  className="p-4 border border-gray-100 rounded-lg hover:border-orange-200 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{cls.date}</span>
                      <span className="text-xs text-gray-500">{cls.time}</span>
                    </div>
                    <span className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded">
                      {cls.hours} 课时
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>课程: {cls.courseName || student.course}</div>
                    {cls.teacher && <div>老师: {cls.teacher}</div>}
                    {cls.content && <div>内容: {cls.content}</div>}
                    {cls.feedback && (
                      <div className="text-orange-600 bg-orange-50 p-2 rounded text-xs mt-2">
                        老师反馈: {cls.feedback}
                      </div>
                    )}
                    {/* PDF 页面图缩略图嵌入 (可点击灯箱全屏放大) */}
                    {cls.textbook_code && cls.unit_number && cls.page_from && cls.page_to && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                          📖 教材第 {cls.page_from}-{cls.page_to} 页 (点击放大查看):
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: Math.max(0, parseInt(cls.page_to) - parseInt(cls.page_from) + 1) }, (_, i) => {
                            const page = parseInt(cls.page_from) + i;
                            const imgUrl = `${API_BASE_URL}/textbooks/page-img/${cls.textbook_code}/${cls.unit_number}/${page}`;
                            const pTitle = `${cls.textbook_code} · Unit ${cls.unit_number} (第 ${page} 页)`;
                            return (
                              <div
                                key={page}
                                onClick={() => setPreviewImg({ url: imgUrl, title: pTitle })}
                                className="group relative w-20 bg-white border border-gray-200 rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-md hover:border-blue-500 transition-all transform hover:-translate-y-0.5"
                                title={`点击放大查看第 ${page} 页`}
                              >
                                <div className="w-full h-24 bg-gray-50 flex items-center justify-center overflow-hidden relative">
                                  <img
                                    src={imgUrl}
                                    alt={`第 ${page} 页`}
                                    className="w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
                                    loading="lazy"
                                    onError={(e) => { e.target.closest('.group').style.display = 'none'; }}
                                  />
                                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity">
                                    <ZoomIn size={14} className="mr-0.5" /> 放大
                                  </div>
                                </div>
                                <div className="text-[11px] font-semibold text-center text-gray-600 bg-gray-50 py-0.5 border-t border-gray-100">
                                  P{page}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* 作业 */}
                    {cls.fb_homework && (
                      <div className="text-xs text-blue-700 mt-1">
                        <span className="font-medium">📝 作业: </span>{cls.fb_homework}
                      </div>
                    )}
                    {cls.notes && (
                      <div className="text-xs text-orange-600 mt-1">课后反馈: {cls.notes}</div>
                    )}
                  </div>
                </div>
              ))}
              {classes.length > 10 && (
                <p className="text-center text-sm text-gray-400 py-2">
                  还有 {classes.length - 10} 条记录...
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">暂无上课记录</p>
          )}
        </div>

        {/* 当前单元/进度 */}
        {student.currentUnit && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-orange-500" />
              当前学习单元
            </h2>
            <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg">
              <p className="text-gray-800">{student.currentUnit}</p>
            </div>
          </div>
        )}

        {/* 底部信息 */}
        <div className="text-center text-sm text-gray-400 py-4">
          <p>阳光桥在线英语 · 家长端</p>
          <p className="mt-1">数据更新时间: {new Date().toLocaleString('zh-CN')}</p>
        </div>
      </div>

      {/* 教材大图预览灯箱 Modal */}
      {previewImg && (
        <div
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImg(null)}
        >
          <div
            className="relative max-w-[92vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute -top-10 -right-2 w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition-all"
              title="关闭 (Esc)"
            >
              <X size={18} />
            </button>
            <img
              src={previewImg.url}
              alt="教材原页大图"
              className="max-h-[82vh] max-w-full rounded-xl shadow-2xl object-contain bg-white"
            />
            {previewImg.title && (
              <div className="text-white text-sm font-medium mt-3 drop-shadow">
                {previewImg.title}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 路由组件 - 根据参数决定显示哪个页面
export default function ParentView() {
  const { studentId } = useParams();
  
  if (!studentId) {
    return <ParentLookup />;
  }
  
  return <ParentStudentView />;
}