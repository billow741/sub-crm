import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { User, Calendar, Package, BookOpen, AlertCircle, X, ZoomIn, Search, ChevronLeft } from 'lucide-react';
import { studentOps, packageOps, classOps, loadData, API_BASE_URL } from '../store';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

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
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-warning-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0 overflow-hidden">
        <div className="bg-primary-500 p-8 text-center relative overflow-hidden">
          {/* Decorative background shapes */}
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-white opacity-10 blur-xl"></div>
          
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              <User className="w-8 h-8 text-primary-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">阳光桥家长门户</h1>
            <p className="text-primary-100 mt-2 text-sm">陪伴孩子的每一步成长</p>
          </div>
        </div>

        <CardContent className="p-8">
          <form onSubmit={handleSearch} className="space-y-6">
            {/* 切换查询方式 */}
            <div className="flex p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSearchType('id')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  searchType === 'id' 
                    ? 'bg-white text-primary-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                学生学号
              </button>
              <button
                type="button"
                onClick={() => setSearchType('phone')}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  searchType === 'phone' 
                    ? 'bg-white text-primary-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                注册手机号
              </button>
            </div>

            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={searchType === 'id' ? 'text' : 'tel'}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={searchType === 'id' ? '请输入学生学号 (如: STU001)' : '请输入手机号'}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-danger-600 bg-danger-50 p-3 rounded-lg text-sm">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full py-3 text-base shadow-md shadow-primary-500/20"
            >
              查询学习档案
            </Button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-400">如有问题请联系课程顾问或授课老师</p>
          </div>
        </CardContent>
      </Card>
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
    async function load() {
      try {
        const s = await studentOps.getById(studentId);
        if (s) {
          setStudent(s);
          const [pkgs, clsList] = await Promise.all([
            packageOps.getByStudent(studentId),
            classOps.getByStudent(studentId)
          ]);
          setPackages(Array.isArray(pkgs) ? pkgs : []);
          setClasses(Array.isArray(clsList) ? clsList : []);
        }
      } catch (err) {
        console.error('Load parent view data error:', err);
      }
    }
    load();
  }, [studentId]);

  if (!student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-warning-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8 border-0 shadow-xl">
          <div className="w-16 h-16 bg-danger-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-danger-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">未找到学生档案</h1>
          <p className="text-gray-500 mb-6 text-sm">请检查学生学号是否正确或已过期</p>
          <Link to="/parent">
            <Button variant="primary">返回重新查询</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // 计算课时统计
  const totalPurchased = packages.reduce((sum, p) => sum + (parseFloat(p.totalHours) || 0), 0);
  const totalRemaining = packages.reduce((sum, p) => sum + (parseFloat(p.remainingHours) || 0), 0);
  const usedHours = totalPurchased - totalRemaining;
  const completionRate = totalPurchased > 0 ? Math.round((usedHours / totalPurchased) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* 沉浸式头部 */}
      <div className="bg-gradient-to-r from-primary-500 to-warning-500 text-white relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white opacity-10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 rounded-full bg-white opacity-10 blur-2xl"></div>

        <div className="max-w-2xl mx-auto px-6 py-8 relative z-10">
          <Link to="/parent" className="inline-flex items-center gap-1 text-white/80 hover:text-white text-sm font-medium mb-6 bg-black/10 px-3 py-1.5 rounded-full backdrop-blur-sm transition-colors">
            <ChevronLeft size={16} /> 切换学生
          </Link>
          
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center shadow-inner border-2 border-white/30 backdrop-blur-md">
              <span className="text-3xl font-bold drop-shadow-md">{student.name?.charAt(0) || '学'}</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold drop-shadow-md">{student.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-white/90 text-sm font-medium">
                {student.gender && (
                  <span className="bg-black/10 px-2.5 py-1 rounded-full backdrop-blur-sm">
                    {student.gender === 'male' ? '男生' : student.gender === 'female' ? '女生' : student.gender}
                  </span>
                )}
                {student.age && (
                  <span className="bg-black/10 px-2.5 py-1 rounded-full backdrop-blur-sm">{student.age} 岁</span>
                )}
                {student.grade && (
                  <span className="bg-black/10 px-2.5 py-1 rounded-full backdrop-blur-sm">{student.grade}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 -mt-6 relative z-20">
        
        {/* 学习进度数据面板 */}
        <Card className="shadow-lg border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <div className="p-1.5 bg-primary-100 rounded-lg">
                  <BookOpen className="w-5 h-5 text-primary-600" />
                </div>
                总体学习进度
              </h2>
            </div>
            
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2 font-medium">
                <span className="text-gray-500">已上课时进度</span>
                <span className="text-primary-600">{completionRate}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-warning-500 transition-all duration-700 ease-out"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 md:gap-4">
              <div className="text-center p-4 bg-primary-50/50 border border-primary-100/50 rounded-xl">
                <div className="text-2xl font-bold text-primary-600">{usedHours}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">已上课时</div>
              </div>
              <div className="text-center p-4 bg-warning-50/50 border border-warning-100/50 rounded-xl">
                <div className="text-2xl font-bold text-warning-600">{totalRemaining}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">剩余课时</div>
              </div>
              <div className="text-center p-4 bg-success-50/50 border border-success-100/50 rounded-xl">
                <div className="text-2xl font-bold text-success-600">{classes.length}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">上课次数</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 当前单元 */}
        {student.currentUnit && (
          <Card className="bg-gradient-to-r from-primary-50 to-warning-50 border-0">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="p-2 bg-white rounded-xl shadow-sm shrink-0 mt-0.5">
                <BookOpen className="w-6 h-6 text-primary-500" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">当前学习单元</h3>
                <p className="font-semibold text-gray-800 leading-tight">{student.currentUnit}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 课时包状态 */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <div className="p-1.5 bg-primary-100 rounded-lg">
                <Package className="w-5 h-5 text-primary-600" />
              </div>
              课时包明细
            </h2>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            <div className="space-y-3">
              {packages.length > 0 ? packages.map((pkg) => (
                <div 
                  key={pkg.id}
                  className="p-4 border border-gray-100 bg-gray-50/50 rounded-xl flex items-center justify-between group hover:bg-white hover:border-primary-100 hover:shadow-sm transition-all"
                >
                  <div>
                    <div className="font-semibold text-gray-800">{pkg.name}</div>
                    <div className="text-xs text-gray-500 mt-1.5 flex items-center gap-2">
                      <span>购于: {pkg.purchaseDate || '-'}</span>
                      <span className="text-gray-300">|</span>
                      <span>有效期: {pkg.expiryDate || '-'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-lg font-bold text-primary-600">
                      {pkg.remainingHours} <span className="text-sm font-medium text-gray-400">/ {pkg.totalHours}</span>
                    </div>
                    <div className="mt-1">
                      <Badge variant={pkg.status === 'active' ? 'success' : 'default'} className="!text-[10px]">
                        {pkg.status === 'active' ? '使用中' : '已结课'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-6 text-gray-400 text-sm">
                  暂无课时包记录
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 最近上课记录 */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <div className="p-1.5 bg-primary-100 rounded-lg">
                <Calendar className="w-5 h-5 text-primary-600" />
              </div>
              成长轨迹 (最近上课记录)
            </h2>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {classes.length > 0 ? (
              <div className="relative border-l-2 border-primary-100 ml-3 pl-5 space-y-6 py-2">
                {classes.slice(0, 10).map((cls, idx) => {
                  const teacher = cls.teacher_name || cls.teacher;
                  const teacherMsg = cls.fb_teacher_message || cls.feedback;
                  const homework = cls.fb_homework || cls.homework;
                  let pronErrors = [];
                  let gramErrors = [];
                  try { pronErrors = typeof cls.fb_pronunciation_errors === 'string' ? JSON.parse(cls.fb_pronunciation_errors) : (cls.fb_pronunciation_errors || []); } catch {}
                  try { gramErrors = typeof cls.fb_grammar_errors === 'string' ? JSON.parse(cls.fb_grammar_errors) : (cls.fb_grammar_errors || []); } catch {}

                  return (
                  <div key={cls.id} className="relative">
                    {/* 时间轴节点 */}
                    <div className="absolute -left-[29px] top-1.5 w-4 h-4 rounded-full border-4 border-white bg-primary-400 shadow-sm"></div>
                    
                    <div className="bg-white border border-gray-100 rounded-xl p-4 hover:border-primary-200 hover:shadow-md transition-all group">
                      <div className="flex items-start justify-between mb-3 border-b border-gray-50 pb-3">
                        <div>
                          <div className="font-bold text-gray-800 flex items-center gap-2">
                            {cls.date}
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{cls.time || (cls.start_time ? cls.start_time.substring(0, 5) : '')}</span>
                          </div>
                          <div className="text-sm font-medium text-gray-600 mt-1">
                            {cls.courseName || cls.subject || student.course || (cls.fb_lesson_level ? `${cls.fb_lesson_level} 课程` : '英语课程')}
                            {(cls.fb_unit || cls.fb_lesson) && (
                              <span className="ml-2 text-primary-600 font-semibold text-xs">
                                Unit {cls.fb_unit || '-'} {cls.fb_lesson ? `L${cls.fb_lesson}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="warning" className="shrink-0 bg-warning-50 text-warning-700 border border-warning-200/50">
                          扣减 {cls.hours} 课时
                        </Badge>
                      </div>
                      
                      <div className="text-sm space-y-2.5">
                        {teacher && (
                          <div className="flex gap-2">
                            <span className="text-gray-400 shrink-0">授课老师:</span>
                            <span className="text-gray-700 font-medium">{teacher}</span>
                          </div>
                        )}

                        {/* 词汇 / 句型 / 语法 */}
                        {(cls.fb_vocab || cls.fb_patterns || cls.fb_grammar) && (
                          <div className="bg-gray-50/80 p-3 rounded-lg border border-gray-100 space-y-1.5 text-xs">
                            {cls.fb_vocab && <div><b className="text-amber-800">词汇：</b><span className="text-gray-700">{cls.fb_vocab}</span></div>}
                            {cls.fb_patterns && <div><b className="text-emerald-800">句型：</b><span className="text-gray-700">{cls.fb_patterns}</span></div>}
                            {cls.fb_grammar && <div><b className="text-indigo-800">语法：</b><span className="text-gray-700">{cls.fb_grammar}</span></div>}
                          </div>
                        )}

                        {/* 发音纠正 */}
                        {Array.isArray(pronErrors) && pronErrors.length > 0 && (
                          <div className="bg-rose-50/40 p-2.5 rounded-lg border border-rose-100/60 text-xs">
                            <span className="text-rose-700 font-bold block mb-1">🗣️ 发音纠错：</span>
                            <div className="space-y-1">
                              {pronErrors.map((e, idx) => (
                                <div key={idx}><span className="text-rose-500">✗ {e.wrong}</span> → <span className="text-emerald-600 font-bold">✓ {e.right}</span></div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 语法纠正 */}
                        {Array.isArray(gramErrors) && gramErrors.length > 0 && (
                          <div className="bg-rose-50/40 p-2.5 rounded-lg border border-rose-100/60 text-xs">
                            <span className="text-rose-700 font-bold block mb-1">📝 语法纠错：</span>
                            <div className="space-y-1">
                              {gramErrors.map((e, idx) => (
                                <div key={idx}><span className="text-rose-500">✗ {e.wrong}</span> → <span className="text-emerald-600 font-bold">✓ {e.right}</span></div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 老师寄语 */}
                        {teacherMsg && (
                          <div className="mt-2 bg-primary-50/50 border border-primary-100 p-3 rounded-lg">
                            <span className="text-primary-700 text-xs font-bold block mb-1">💌 老师寄语:</span>
                            <span className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{teacherMsg}</span>
                          </div>
                        )}

                        {/* 作业 */}
                        {homework && (
                          <div className="mt-2 bg-blue-50/50 border border-blue-100 p-3 rounded-lg">
                            <span className="text-blue-700 text-xs font-bold block mb-1">📝 课后作业:</span>
                            <span className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{homework}</span>
                          </div>
                        )}

                        {/* 上课内容 */}
                        {cls.content && cls.content !== teacherMsg && (
                          <div className="flex gap-2">
                            <span className="text-gray-400 shrink-0">学习内容:</span>
                            <span className="text-gray-700">{cls.content}</span>
                          </div>
                        )}

                        {/* 备注 */}
                        {cls.notes && (
                          <div className="flex gap-2">
                            <span className="text-gray-400 shrink-0">系统备注:</span>
                            <span className="text-gray-600">{cls.notes}</span>
                          </div>
                        )}

                        {/* PDF 页面图缩略图 */}
                        {cls.textbook_code && cls.unit_number && cls.page_from && cls.page_to && (
                          <div className="mt-3 pt-3 border-t border-gray-50">
                            <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                              📖 教材第 {cls.page_from}-{cls.page_to} 页:
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
                                    className="group relative w-16 h-20 md:w-20 md:h-24 bg-white border border-gray-200 rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-md hover:border-primary-400 transition-all transform hover:-translate-y-1"
                                    title={`点击放大查看第 ${page} 页`}
                                  >
                                    <img
                                      src={imgUrl}
                                      alt={`第 ${page} 页`}
                                      className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-110"
                                      loading="lazy"
                                      onError={(e) => { e.target.closest('.group').style.display = 'none'; }}
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity duration-200">
                                      <ZoomIn size={16} />
                                    </div>
                                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center py-0.5 backdrop-blur-sm">
                                      P{page}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
                {classes.length > 10 && (
                  <div className="relative pt-4 text-center">
                    <div className="absolute -left-[23px] top-6 w-2 h-2 rounded-full bg-gray-300"></div>
                    <span className="text-sm font-medium text-gray-400 bg-gray-100 px-4 py-1.5 rounded-full">
                      还有 {classes.length - 10} 条历史记录
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-400 font-medium">暂无上课记录</p>
                <p className="text-sm text-gray-400 mt-1">当老师记录上课情况后会在这里显示</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 底部信息 */}
        <div className="text-center text-xs text-gray-400 py-6 font-medium space-y-1">
          <p>© 阳光桥在线英语 · 家长专属陪伴门户</p>
          <p>数据更新时间: {new Date().toLocaleString('zh-CN', { hour12: false })}</p>
        </div>
      </div>

      {/* 教材大图预览灯箱 Modal */}
      {previewImg && (
        <div
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImg(null)}
        >
          <div
            className="relative max-w-[95vw] max-h-[95vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute -top-12 right-0 md:-right-12 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors border border-white/20 backdrop-blur-md"
              title="关闭预览 (Esc)"
            >
              <X size={20} />
            </button>
            <img
              src={previewImg.url}
              alt="教材原页大图"
              className="max-h-[85vh] max-w-full rounded-xl shadow-2xl object-contain bg-white/5 ring-1 ring-white/20"
            />
            {previewImg.title && (
              <div className="text-white/90 text-sm font-medium mt-4 bg-black/40 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10">
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