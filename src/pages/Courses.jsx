import { useState, useEffect } from 'react';
import { BookOpen, Plus, Edit2, Trash2, Clock, DollarSign, User, Search, Book } from 'lucide-react';
import { courseOps, teacherOps } from '../store';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

const LEVEL_LABELS = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级',
  all: '全部等级'
};

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    level: 'all',
    duration: '60',
    price: '',
    description: '',
    teacher_id: '',
    status: 'active'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [coursesData, teachersData] = await Promise.all([
        courseOps.getAll(),
        teacherOps.getAll()
      ]);
      setCourses(Array.isArray(coursesData) ? coursesData : []);
      setTeachers(Array.isArray(teachersData) ? teachersData.filter(t => t.status === 'active') : []);
    } catch (err) {
      console.error('Load error:', err);
      setCourses([]);
      setTeachers([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const courseData = {
        ...formData,
        duration: parseInt(formData.duration) || 60,
        price: formData.price ? parseFloat(formData.price) : null,
        teacher_id: formData.teacher_id ? parseInt(formData.teacher_id) : null
      };

      if (editingCourse) {
        await courseOps.update(editingCourse.id, courseData);
      } else {
        await courseOps.add(courseData);
      }

      setShowModal(false);
      setEditingCourse(null);
      setFormData({ name: '', subject: '', level: 'all', duration: '60', price: '', description: '', teacher_id: '', status: 'active' });
      loadData();
    } catch (err) {
      alert('保存失败：' + err.message);
    }
  };

  const handleEdit = (course) => {
    setEditingCourse(course);
    setFormData({
      name: course.name,
      subject: course.subject || '',
      level: course.level || 'all',
      duration: course.duration?.toString() || '60',
      price: course.price?.toString() || '',
      description: course.description || '',
      teacher_id: course.teacher_id?.toString() || '',
      status: course.status
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个课程吗？')) return;
    try {
      await courseOps.delete(id);
      loadData();
    } catch (err) {
      alert('删除失败：' + err.message);
    }
  };

  const filteredCourses = courses.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.teacher_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCourses = filteredCourses.filter(c => c.status === 'active');
  const inactiveCourses = filteredCourses.filter(c => c.status === 'inactive');

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl flex items-center justify-center text-primary-600 shadow-inner">
            <Book className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">课程管理</h1>
            <p className="text-sm text-gray-500 font-medium">配置班型科目与课时单价</p>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditingCourse(null);
            setFormData({ name: '', subject: '', level: 'all', duration: '60', price: '', description: '', teacher_id: '', status: 'active' });
            setShowModal(true);
          }}
          className="shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加课程
        </Button>
      </div>

      {/* 搜索框 */}
      <Card className="overflow-hidden border-0 shadow-sm bg-white/50 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="搜索课程名称、科目、教师..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none transition-shadow text-sm font-medium"
            />
          </div>
        </CardContent>
      </Card>

      {/* 启用的课程 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <h2 className="text-lg font-bold text-gray-800">启用的课程</h2>
          <Badge variant="primary" className="bg-primary-100 text-primary-700">{activeCourses.length}</Badge>
        </div>
        
        {activeCourses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 border-dashed p-12 flex flex-col items-center justify-center text-gray-400 space-y-4 shadow-sm">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium">暂无启用的课程</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeCourses.map(course => (
              <CourseCard key={course.id} course={course} teachers={teachers} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* 停用的课程 */}
      {inactiveCourses.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2 px-2 opacity-70">
            <h2 className="text-lg font-bold text-gray-500">已停用的课程</h2>
            <Badge variant="secondary" className="bg-gray-200 text-gray-600">{inactiveCourses.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 opacity-60 grayscale-[30%]">
            {inactiveCourses.map(course => (
              <CourseCard key={course.id} course={course} teachers={teachers} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg shadow-2xl border-0 max-h-[90vh] flex flex-col">
            <CardHeader className="border-b border-gray-100 bg-white/50 px-6 py-5 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {editingCourse ? '编辑课程' : '添加新课程'}
              </h2>
            </CardHeader>
            <div className="p-6 overflow-y-auto bg-gray-50/50 flex-1">
              <form id="courseForm" onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">课程名称 <span className="text-danger-500">*</span></label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如: 少儿英语启蒙班"
                    className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-bold"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">科目</label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="例如: 英语"
                      className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">难度等级</label>
                    <select
                      value={formData.level}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                      className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-medium"
                    >
                      <option value="beginner">初级</option>
                      <option value="intermediate">中级</option>
                      <option value="advanced">高级</option>
                      <option value="all">全部等级</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">课程时长（分钟）</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="number"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-medium"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">单价（元/课时）</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="number" step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        placeholder="留空为无"
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-bold text-success-700"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">默认授课教师</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <select
                        value={formData.teacher_id}
                        onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-medium"
                      >
                        <option value="">不指定</option>
                        {teachers.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">状态</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white font-bold"
                    >
                      <option value="active">启用 (Active)</option>
                      <option value="inactive">停用 (Inactive)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">课程描述</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    placeholder="选填: 添加一些课程简介..."
                    className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white leading-relaxed resize-none"
                  />
                </div>
              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                取消
              </Button>
              <Button type="submit" form="courseForm" variant="primary" className="px-6 shadow-sm">
                保存配置
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, teachers, onEdit, onDelete }) {
  return (
    <Card className="group overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border-gray-200">
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl flex items-center justify-center shrink-0 border border-primary-100/50">
                <BookOpen className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 leading-tight mb-1">{course.name}</h3>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={course.status === 'active' ? 'success' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                    {course.status === 'active' ? '启用' : '停用'}
                  </Badge>
                  {course.subject && (
                    <Badge variant="primary" className="bg-primary-50 text-primary-700 border-primary-200 px-1.5 py-0 text-[10px]">
                      {course.subject}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(course)} className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-primary-600 rounded-lg transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(course.id)} className="p-1.5 hover:bg-danger-50 text-gray-400 hover:text-danger-600 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 bg-gray-50/80 p-3 rounded-xl border border-gray-100/80">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-700">{course.duration || 60} 分钟</span>
            </div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-gray-400" />
              <span className={`font-bold ${course.price ? 'text-success-600' : 'text-gray-400'}`}>
                {course.price ? `¥${course.price}` : '未定价'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-700 truncate" title={course.teacher_name || '不限'}>
                {course.teacher_name || '不限'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-gray-300"></div>
              </div>
              <span className="text-gray-500 text-xs">
                {LEVEL_LABELS[course.level] || course.level}
              </span>
            </div>
          </div>

          {course.description && (
            <p className="mt-4 text-sm text-gray-500 line-clamp-2 leading-relaxed bg-white border border-gray-100 p-2.5 rounded-lg text-xs italic">
              "{course.description}"
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
