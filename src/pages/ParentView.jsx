import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User, Calendar, Package, Clock, BookOpen, AlertCircle } from 'lucide-react';
import { studentOps, packageOps, classOps, loadData } from '../store';

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

// 家长端 - 查看孩子信息页面
function ParentStudentView() {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [packages, setPackages] = useState([]);
  const [classes, setClasses] = useState([]);

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
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">未找到学生信息</p>
          <Link to="/parent" className="text-orange-600 hover:underline mt-2 inline-block">
            返回查询
          </Link>
        </div>
      </div>
    );
  }

  // 计算统计数据
  const totalRemaining = packages.reduce((sum, p) => sum + (p.remaining || 0), 0);
  const totalHours = packages.reduce((sum, p) => sum + (p.total || 0), 0);
  const usedHours = totalHours - totalRemaining;
  const completionRate = totalHours > 0 ? Math.round((usedHours / totalHours) * 100) : 0;

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
          
          {/* 进度条 */}
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
          
          {packages.length > 0 ? (
            <div className="space-y-4">
              {packages.map(pkg => (
                <div key={pkg.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium text-gray-800">{pkg.name}</h3>
                      {pkg.expiryDate && (
                        <p className="text-sm text-gray-500">到期日期: {pkg.expiryDate}</p>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      pkg.remaining < 3 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                    }`}>
                      {pkg.remaining} 节剩余
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${pkg.remaining < 3 ? 'bg-red-400' : 'bg-orange-500'}`}
                      style={{ width: `${(pkg.remaining / pkg.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>已用: {pkg.used} 节</span>
                    <span>总计: {pkg.total} 节</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">暂无课时包</p>
          )}
        </div>

        {/* 上课记录 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-500" />
            上课记录
          </h2>
          
          {classes.length > 0 ? (
            <div className="space-y-3">
              {classes.slice(0, 10).map(cls => (
                <div key={cls.id} className="flex items-start gap-4 p-3 border-b border-gray-100 last:border-0">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{cls.date}</div>
                    <div className="text-sm text-gray-500">
                      {cls.hours} 节 · {cls.teacher || '常规课程'}
                    </div>
                    {/* 课程信息: 教材+Unit+Page */}
                    {((cls.textbook_code && cls.unit_number) || cls.fb_unit) && (
                      <div className="text-xs text-purple-600 mt-1">
                        📚 {cls.textbook_code || 'EU'} · Unit {cls.unit_number || cls.fb_unit}
                        {cls.page_from && cls.page_to && ` · 页 ${cls.page_from}-${cls.page_to}`}
                      </div>
                    )}
                    {/* 今日词汇 */}
                    {cls.fb_vocab && (
                      <div className="text-xs text-gray-700 mt-1">
                        <span className="font-medium">今日学: </span>{cls.fb_vocab}
                      </div>
                    )}
                    {/* 句型 */}
                    {cls.fb_patterns && (
                      <div className="text-xs text-gray-700 mt-0.5">
                        <span className="font-medium">句型: </span>{cls.fb_patterns}
                      </div>
                    )}
                    {/* PDF 页面图嵌入 (家长可看到教材真实页面,方便复习) */}
                    {cls.textbook_code && cls.unit_number && cls.page_from && cls.page_to && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-500 mb-1">📖 教材第 {cls.page_from}-{cls.page_to} 页 (点击放大查看):</div>
                        <div className="grid grid-cols-3 gap-1">
                          {Array.from({ length: Math.max(0, parseInt(cls.page_to) - parseInt(cls.page_from) + 1) }, (_, i) => {
                            const page = parseInt(cls.page_from) + i;
                            return (
                              <a
                                key={page}
                                href={`https://api.changtian.dpdns.org/api/v1/textbooks/page-img/${cls.textbook_code}/${cls.unit_number}/${page}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block border rounded overflow-hidden hover:shadow-md"
                                title={`点击看大图: 第 ${page} 页`}
                              >
                                <img
                                  src={`https://api.changtian.dpdns.org/api/v1/textbooks/page-img/${cls.textbook_code}/${cls.unit_number}/${page}`}
                                  alt={`第 ${page} 页`}
                                  className="w-full h-auto"
                                  loading="lazy"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                                <div className="text-xs text-center text-gray-500 bg-white py-0.5">P{page}</div>
                              </a>
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