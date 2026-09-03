import { useState, useEffect, useRef } from 'react';
import { 
  Book, FileText, Upload, Sparkles, Loader, CheckCircle, XCircle, 
  Trash2, Plus, Edit3, Save, Eye, RefreshCw, AlertCircle, 
  ExternalLink, Layers, ChevronRight, Check, X, ArrowRight, Play, CheckCheck, BookOpen, Camera
} from 'lucide-react';
import { request, API_BASE_URL, API_KEY } from '../store/api';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export default function Textbooks() {
  // 核心数据状态
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBookCode, setSelectedBookCode] = useState(null);
  const [bookUnits, setBookUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedUnitNum, setSelectedUnitNum] = useState(null);
  const [unitDetail, setUnitDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // R2 切图列表与本地渲染
  const [r2Pages, setR2Pages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [renderedImages, setRenderedImages] = useState([]); // [{blob, url}]
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState('');

  // AI 提取与保存状态
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('vocab'); // 'vocab' | 'patterns' | 'phonics' | 'reading' | 'grammar'

  // 弹窗状态
  const [showBooksManage, setShowBooksManage] = useState(false);
  const [showBatchBookModal, setShowBatchBookModal] = useState(false);
  const [showLlmSettingsModal, setShowLlmSettingsModal] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState(null);

  // 系列目录状态
  const [selectedSeries, setSelectedSeries] = useState('ALL');
  const [collapsedSeries, setCollapsedSeries] = useState({});

  // 提取所有教材系列 (Series)
  const seriesList = Array.from(new Set(books.map(b => b.series || '未分类系列'))).filter(Boolean);

  // 按照系列分组
  const groupedBooks = books.reduce((acc, b) => {
    const s = b.series || '未分类系列';
    if (!acc[s]) acc[s] = [];
    acc[s].push(b);
    return acc;
  }, {});

  // AI 视觉模型设置 (支持 localStorage 持久化)
  const [llmConfig, setLlmConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('sb_llm_config');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      provider: 'nvidia_11b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: '',
      model: 'meta/llama-3.2-11b-vision-instruct'
    };
  });

  const saveLlmConfig = (newCfg) => {
    setLlmConfig(newCfg);
    try {
      localStorage.setItem('sb_llm_config', JSON.stringify(newCfg));
    } catch {}
  };

  // 加载教材列表
  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async (keepSelection = true) => {
    setLoading(true);
    try {
      const resp = await request('/textbooks');
      const list = resp.data || [];
      setBooks(list);
      if (list.length > 0 && (!selectedBookCode || !keepSelection)) {
        selectBook(list[0].code);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // 切换选中教材
  const selectBook = async (code) => {
    setSelectedBookCode(code);
    setSelectedUnitNum(null);
    setUnitDetail(null);
    setR2Pages([]);
    setRenderedImages([]);
    setLoadingUnits(true);

    try {
      const resp = await request(`/textbooks/units-manage/${code}`);
      const units = resp.data?.units || [];
      setBookUnits(units);
      if (units.length > 0) {
        selectUnit(code, units[0].unit_number);
      }
    } catch (e) {
      console.error(e);
      setBookUnits([]);
    }
    setLoadingUnits(false);
  };

  // 一键初始化单元大纲
  const handleInitUnits = async (code, structType = 'unit') => {
    if (!code) return;
    try {
      setLoadingUnits(true);
      await request(`/textbooks/init-units/${code}`, { method: 'POST', body: { structure_type: structType } });
      await selectBook(code);
    } catch (e) {
      alert('初始化大纲失败: ' + e.message);
      setLoadingUnits(false);
    }
  };

  // 课时/单元大纲标题编辑与新增
  const [editingUnitNum, setEditingUnitNum] = useState(null);
  const [editingUnitTitle, setEditingUnitTitle] = useState('');

  const handleSaveUnitTitle = async (code, num, newTitle) => {
    if (!newTitle.trim()) return setEditingUnitNum(null);
    try {
      await request(`/textbooks/units-manage/${code}/${num}`, {
        method: 'PATCH',
        body: { unit_title: newTitle.trim() }
      });
      setBookUnits(prev => prev.map(u => u.unit_number === num ? { ...u, unit_title: newTitle.trim() } : u));
      setEditingUnitNum(null);
    } catch (e) {
      alert('修改失败: ' + e.message);
    }
  };

  const handleAddNewUnit = async (code) => {
    const nextNum = bookUnits.length > 0 ? Math.max(...bookUnits.map(u => u.unit_number)) + 1 : 1;
    const firstTitle = bookUnits[0]?.unit_title || '';
    const prefix = firstTitle.includes('Lesson') ? 'Lesson' : firstTitle.includes('Chapter') ? 'Chapter' : firstTitle.includes('Story') ? 'Story' : 'Unit';
    const defaultTitle = `${prefix} ${nextNum}`;
    const customTitle = prompt(`请输入第 ${nextNum} 课/单元的标题名称:`, defaultTitle);
    if (!customTitle) return;

    try {
      await request(`/textbooks/units-manage/${code}`, {
        method: 'POST',
        body: { unit_number: nextNum, unit_title: customTitle.trim(), lesson_count: 1 }
      });
      await selectBook(code);
    } catch (e) {
      alert('添加失败: ' + e.message);
    }
  };

  // 切换选中单元
  const selectUnit = async (code, unitNum) => {
    setSelectedUnitNum(unitNum);
    setLoadingDetail(true);
    setRenderedImages([]); // 清除本地临时切片

    // 立即彻底重置 unitDetail 为当前单元的独立干净状态，杜绝旧单元数据残留污染
    const u = bookUnits.find(item => item.unit_number === unitNum);
    setUnitDetail({
      unit_number: unitNum,
      unit_title: u?.unit_title || `Unit ${unitNum}`,
      vocab: [],
      patterns: [],
      grammar: [],
      extra_content: {}
    });

    // 1. 获取单元内容
    try {
      const resp = await request(`/textbooks/content/${code}/${unitNum}`);
      if (resp.data) {
        setUnitDetail({
          unit_number: unitNum,
          unit_title: resp.data.unit_title || u?.unit_title || `Unit ${unitNum}`,
          vocab: resp.data.vocab || [],
          patterns: resp.data.patterns || [],
          grammar: resp.data.grammar || [],
          extra_content: resp.data.extra_content || {}
        });
      }
    } catch (e) {
      console.warn('Load unit content err:', e);
    }

    // 2. 获取该单元在 R2 的切图列表
    loadUnitPages(code, unitNum);
    setLoadingDetail(false);
  };

  const loadUnitPages = async (code, unitNum) => {
    setLoadingPages(true);
    try {
      const resp = await request(`/textbooks/unit-pages/${code}/${unitNum}`);
      setR2Pages(resp.data?.pages || []);
    } catch (e) {
      setR2Pages([]);
    }
    setLoadingPages(false);
  };

  // 处理单单元 PDF 上传与浏览器端切片
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRendering(true);
    setRenderProgress('正在加载 PDF 解析引擎...');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const imgs = [];

      for (let i = 1; i <= numPages; i++) {
        setRenderProgress(`正在渲染第 ${i} / ${numPages} 页...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
        imgs.push({ blob, url: URL.createObjectURL(blob) });
      }

      setRenderedImages(imgs);
    } catch (err) {
      if (err.message && (err.message.includes('dynamically imported module') || err.message.includes('MIME type'))) {
        if (confirm('系统已发布更新版本，需要刷新浏览器以载入最新组件。是否立即刷新？')) {
          window.location.reload();
          return;
        }
      }
      alert('PDF 解析失败: ' + err.message);
    }
    setRendering(false);
    setRenderProgress('');
  };

  // 扩展维度编辑辅助函数
  const updateExtraField = (dim, idx, field, val) => {
    setUnitDetail(prev => {
      if (!prev) return prev;
      const extra = { ...(prev.extra_content || {}) };
      const arr = [...(extra[dim] || [])];
      arr[idx] = { ...arr[idx], [field]: val };
      extra[dim] = arr;
      return { ...prev, extra_content: extra };
    });
  };

  const removeExtraItem = (dim, idx) => {
    setUnitDetail(prev => {
      if (!prev) return prev;
      const extra = { ...(prev.extra_content || {}) };
      const arr = [...(extra[dim] || [])];
      arr.splice(idx, 1);
      extra[dim] = arr;
      return { ...prev, extra_content: extra };
    });
  };

  const addExtraItem = (dim, defaultItem) => {
    setUnitDetail(prev => {
      if (!prev) return prev;
      const extra = { ...(prev.extra_content || {}) };
      const arr = [...(extra[dim] || [])];
      arr.push(defaultItem);
      extra[dim] = arr;
      return { ...prev, extra_content: extra };
    });
  };

  // 触发 AI 视觉识别当前单元
  const handleAiExtract = async () => {
    if (!selectedBookCode || selectedUnitNum === null) return;
    if (renderedImages.length === 0 && r2Pages.length === 0) {
      alert('请先上传该单元的 PDF 文件进行切片');
      return;
    }

    setExtracting(true);
    // 提取开始前，立即清空旧数据，防止新旧数据混淆污染
    setUnitDetail(prev => ({
      ...prev,
      vocab: [],
      patterns: [],
      grammar: [],
      extra_content: {}
    }));

    try {
      const fd = new FormData();
      const loadedBlobs = [];

      if (renderedImages.length > 0) {
        renderedImages.forEach((img, i) => {
          loadedBlobs.push(img.blob);
          fd.append('images', img.blob, `page-${String(i + 1).padStart(2, '0')}.jpg`);
        });

        // 合成超清全景拼图 (包含该单元全部 8 页课文)
        const loadedImgs = await Promise.all(loadedBlobs.map(b => new Promise(res => {
          const img = new Image();
          img.onload = () => res(img);
          img.src = URL.createObjectURL(b);
        })));

        const cols = loadedImgs.length <= 2 ? loadedImgs.length : (loadedImgs.length <= 4 ? 2 : 4);
        const rows = Math.ceil(loadedImgs.length / cols);
        const singleW = 800;
        const singleH = (loadedImgs[0].naturalHeight / loadedImgs[0].naturalWidth) * singleW;

        const collageCanvas = document.createElement('canvas');
        collageCanvas.width = singleW * cols;
        collageCanvas.height = singleH * rows;
        const cCtx = collageCanvas.getContext('2d');
        cCtx.fillStyle = '#ffffff';
        cCtx.fillRect(0, 0, collageCanvas.width, collageCanvas.height);

        loadedImgs.forEach((img, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          cCtx.drawImage(img, col * singleW, row * singleH, singleW, singleH);
        });

        const collageBlob = await new Promise(res => collageCanvas.toBlob(res, 'image/jpeg', 0.85));
        fd.append('ai_vision', collageBlob, 'ai_vision.jpg');
      }

      // 携带当前教材的 schema 配置
      const curBook = books.find(b => b.code === selectedBookCode);
      if (curBook?.content_schema) {
        fd.append('content_schema', JSON.stringify(curBook.content_schema));
      }

      if (llmConfig.baseUrl) fd.append('llm_base_url', llmConfig.baseUrl);
      if (llmConfig.apiKey) fd.append('llm_api_key', llmConfig.apiKey);
      if (llmConfig.model) fd.append('llm_model', llmConfig.model);

      const headers = { 'X-API-Key': API_KEY };
      if (llmConfig.baseUrl) headers['X-LLM-Base-Url'] = llmConfig.baseUrl;
      if (llmConfig.apiKey) headers['X-LLM-Api-Key'] = llmConfig.apiKey;
      if (llmConfig.model) headers['X-LLM-Model'] = llmConfig.model;

      const res = await fetch(`${API_BASE_URL}/textbooks/preview-unit/${selectedBookCode}/${selectedUnitNum}`, {
        method: 'POST',
        headers,
        body: fd
      });
      const json = await res.json();

      if (json.data) {
        const d = json.data;
        const u = bookUnits.find(item => item.unit_number === selectedUnitNum);
        // 彻底全量赋值，绝不使用 prev 混入旧单元数据
        setUnitDetail({
          unit_number: selectedUnitNum,
          unit_title: d.unit_title || u?.unit_title || `Unit ${selectedUnitNum}`,
          vocab: d.vocab || [],
          patterns: d.patterns || [],
          grammar: d.grammar || [],
          extra_content: d.extra_content || {}
        });
        loadUnitPages(selectedBookCode, selectedUnitNum);

        const extraCount = Object.values(d.extra_content || {}).reduce((acc, v) => acc + (Array.isArray(v) ? v.length : 0), 0);
        alert(`🎉 AI 识别成功！已识别 ${(d.vocab || []).length} 个核心词汇、${(d.patterns || []).length} 个句型` + (extraCount > 0 ? `及 ${extraCount} 项拼读/专项教学要素` : '') + `，请在右侧校对后点击【保存入库】！`);
      } else {
        alert('AI 识别失败: ' + (json.error?.message || '未知错误'));
      }
    } catch (err) {
      alert('识别请求出错: ' + err.message);
    }
    setExtracting(false);
  };

  // 保存当前校对内容到 D1 数据库
  const handleSaveUnitContent = async () => {
    if (!selectedBookCode || selectedUnitNum === null || !unitDetail) return;
    setSaving(true);
    try {
      const resp = await request(`/textbooks/content/${selectedBookCode}/${selectedUnitNum}`, {
        method: 'POST',
        body: JSON.stringify({
          vocab: unitDetail.vocab || [],
          patterns: unitDetail.patterns || [],
          grammar: unitDetail.grammar || [],
          extra_content: unitDetail.extra_content || {},
          extracted_by: 'ai_workbench'
        })
      });

      if (resp.data) {
        if (unitDetail.unit_title) {
          await request(`/textbooks/units-manage/${selectedBookCode}/${selectedUnitNum}`, {
            method: 'PATCH',
            body: JSON.stringify({ unit_title: unitDetail.unit_title })
          });
        }

        alert('✅ 保存成功！教师端与家长端已同步更新');
        const uResp = await request(`/textbooks/units-manage/${selectedBookCode}`);
        setBookUnits(uResp.data?.units || []);
      } else {
        alert('保存失败: ' + (resp.error?.message || '未知错误'));
      }
    } catch (err) {
      alert('保存出错: ' + err.message);
    }
    setSaving(false);
  };

  // 删除单张 R2 切图 (支持按精确 key 或 pageNum 删除)
  const handleDeletePageImg = async (pageObj) => {
    const pageNum = pageObj.page_num || pageObj;
    const key = pageObj.key;
    if (!confirm(`确定删除第 ${pageNum} 页切图吗？`)) return;
    try {
      if (key) {
        await request('/textbooks/delete-r2-key', {
          method: 'POST',
          body: JSON.stringify({ key })
        });
      } else {
        await request(`/textbooks/page-img/${selectedBookCode}/${selectedUnitNum}/${pageNum}`, {
          method: 'DELETE'
        });
      }
      loadUnitPages(selectedBookCode, selectedUnitNum);
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  // 一键清空当前单元所有 R2 切图
  const handleClearAllPages = async () => {
    if (!confirm(`⚠️ 确定清空该单元 (${selectedBookCode} Unit ${selectedUnitNum}) 在 R2 中的全部 ${r2Pages.length} 张切图吗？`)) return;
    try {
      await request(`/textbooks/unit-pages/${selectedBookCode}/${selectedUnitNum}`, {
        method: 'DELETE'
      });
      loadUnitPages(selectedBookCode, selectedUnitNum);
      alert('✅ 已成功清空该单元所有切图');
    } catch (e) {
      alert('清空失败: ' + e.message);
    }
  };

  // 编辑助手函数
  const addVocabItem = () => {
    setUnitDetail(prev => ({
      ...prev,
      vocab: [...(prev.vocab || []), { word: '', translation: '', is_core: true, difficulty: 1 }]
    }));
  };

  const updateVocabItem = (index, field, val) => {
    setUnitDetail(prev => {
      const list = [...prev.vocab];
      list[index] = { ...list[index], [field]: val };
      return { ...prev, vocab: list };
    });
  };

  const removeVocabItem = (index) => {
    setUnitDetail(prev => ({
      ...prev,
      vocab: prev.vocab.filter((_, i) => i !== index)
    }));
  };

  const addPatternItem = () => {
    setUnitDetail(prev => ({
      ...prev,
      patterns: [...(prev.patterns || []), { pattern: '', translation: '', is_core: true }]
    }));
  };

  const updatePatternItem = (index, field, val) => {
    setUnitDetail(prev => {
      const list = [...prev.patterns];
      list[index] = { ...list[index], [field]: val };
      return { ...prev, patterns: list };
    });
  };

  const removePatternItem = (index) => {
    setUnitDetail(prev => ({
      ...prev,
      patterns: prev.patterns.filter((_, i) => i !== index)
    }));
  };

  const addGrammarItem = () => {
    setUnitDetail(prev => ({
      ...prev,
      grammar: [...(prev.grammar || []), { point: '', example: '', is_core: true }]
    }));
  };

  const updateGrammarItem = (index, field, val) => {
    setUnitDetail(prev => {
      const list = [...prev.grammar];
      list[index] = { ...list[index], [field]: val };
      return { ...prev, grammar: list };
    });
  };

  const removeGrammarItem = (index) => {
    setUnitDetail(prev => ({
      ...prev,
      grammar: prev.grammar.filter((_, i) => i !== index)
    }));
  };

  const selectedBook = books.find(b => b.code === selectedBookCode);
  const schemaType = selectedBook?.content_schema?.type || (selectedBookCode?.toLowerCase().includes('phonics') ? 'phonics' : 'general_english');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px] text-gray-500 gap-2">
        <Loader className="w-5 h-5 animate-spin text-primary-500" />
        <span>正在加载教材工作台...</span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-50 overflow-hidden font-sans">
      {/* 顶部工具栏 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl flex items-center justify-center text-primary-700 shadow-inner">
            <Book className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              教材数字化工作台
              <Badge variant="primary" className="bg-primary-50 text-primary-700 text-xs px-2 border border-primary-200">
                SaaS Workbench
              </Badge>
            </h1>
            <p className="text-xs text-gray-500 font-medium">统一标准 R2 存储 · AI 视觉切片提取 · 双语对照闭环</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowLlmSettingsModal(true)} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800">
            <Sparkles className="w-4 h-4 mr-1.5" /> AI 模型设置
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowBatchBookModal(true)} className="border-primary-200 text-primary-700 hover:bg-primary-50">
            <Book className="w-4 h-4 mr-1.5" /> 整本 PDF 批量导入
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowBooksManage(true)} className="bg-primary-600 hover:bg-primary-700 text-white shadow-sm font-bold">
            <Plus className="w-4 h-4 mr-1.5" /> ➕ 新增/管理教材
          </Button>
        </div>
      </div>

      {/* 三栏工作区主体 */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ================= 第一栏：教材系列与目录列表 (280px) ================= */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0 z-0">
          <div className="p-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Layers className="w-4 h-4 text-primary-600 shrink-0" />
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wider truncate">教材系列 ({seriesList.length})</span>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-primary-600 hover:bg-primary-50 font-bold" onClick={() => setShowBooksManage(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 新增教材
            </Button>
          </div>

          {/* 系列筛选标签 (自适应换行，彻底消除横向滚动条) */}
          {seriesList.length > 1 && (
            <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap items-center gap-1.5 bg-slate-50/60 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSeries('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  selectedSeries === 'ALL'
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                全部 ({books.length})
              </button>
              {seriesList.map(s => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSelectedSeries(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedSeries === s
                      ? 'bg-primary-600 text-white shadow-xs'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {s} ({groupedBooks[s]?.length || 0})
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {(selectedSeries === 'ALL' ? Object.entries(groupedBooks) : [[selectedSeries, groupedBooks[selectedSeries] || []]]).map(([sName, sBooks]) => {
              const isCollapsed = collapsedSeries[sName];
              return (
                <div key={sName} className="space-y-1.5">
                  {/* 系列级 Header */}
                  {selectedSeries === 'ALL' && (
                    <div
                      onClick={() => setCollapsedSeries(prev => ({ ...prev, [sName]: !prev[sName] }))}
                      className="flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-r from-slate-100/90 to-gray-100/60 hover:from-slate-200/90 hover:to-gray-200/60 rounded-lg cursor-pointer transition-colors select-none border border-gray-200/60"
                    >
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5 truncate">
                        <BookOpen className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                        <span className="truncate">{sName}</span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-gray-500 font-bold bg-white px-1.5 py-0.5 rounded shadow-2xs">{sBooks.length} 册</span>
                        <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                      </div>
                    </div>
                  )}

                  {/* 该系列下的教材册别 */}
                  {(!isCollapsed || selectedSeries !== 'ALL') && (
                    <div className="space-y-1.5 pl-0.5">
                      {sBooks.map(b => {
                        const isSelected = b.code === selectedBookCode;
                        return (
                          <div
                            key={b.code}
                            onClick={() => selectBook(b.code)}
                            className={`p-3 rounded-xl cursor-pointer transition-all border text-left ${
                              isSelected
                                ? 'bg-primary-50/80 border-primary-300 shadow-sm ring-1 ring-primary-500/20'
                                : 'bg-white border-gray-200 hover:border-primary-300 hover:bg-gray-50 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <span className="font-bold text-sm text-gray-900 leading-tight">{b.name}</span>
                              <Badge variant="secondary" className="text-[10px] bg-gray-100 uppercase py-0.5">{b.level || 'A1'}</Badge>
                            </div>
                            <div className="text-xs text-gray-500 mt-2 flex items-center justify-between">
                              <span className="font-medium text-gray-400">{b.code}</span>
                              <span className="font-bold text-primary-600">{b.unit_count || 0} / {b.total_units} 单元</span>
                            </div>
                            {/* 进度条 */}
                            <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2.5 overflow-hidden">
                              <div
                                className="bg-primary-500 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${Math.min(100, Math.round(((b.unit_count || 0) / (b.total_units || 1)) * 100))}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= 第二栏：课时/单元大纲列表 (280px) ================= */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0 z-0">
          <div className="p-3.5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider truncate mr-2">
              {selectedBook ? `${selectedBook.code} 目录` : '大纲目录'}
            </span>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="bg-gray-100 text-[10px]">
                {bookUnits.length} 项
              </Badge>
              {selectedBookCode && (
                <button
                  onClick={() => handleAddNewUnit(selectedBookCode)}
                  className="p-1 text-primary-600 hover:bg-primary-50 rounded transition-colors"
                  title="添加新课时/单元"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {loadingUnits ? (
              <div className="py-8 text-center text-xs text-gray-400 flex justify-center items-center gap-2">
                <Loader className="w-3.5 h-3.5 animate-spin" /> 加载中...
              </div>
            ) : bookUnits.length === 0 ? (
              <div className="py-8 text-center px-4 space-y-3 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 m-2">
                <BookOpen className="w-8 h-8 text-gray-300 mx-auto opacity-40" />
                <div className="text-xs text-gray-500 font-medium">该教材暂未生成目录</div>
                {selectedBookCode && (
                  <div className="space-y-2 pt-1">
                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full text-xs shadow-sm py-1.5"
                      onClick={() => handleInitUnits(selectedBookCode, 'lesson')}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> 按 Lesson 生成 (如拼读)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs shadow-sm py-1.5"
                      onClick={() => handleInitUnits(selectedBookCode, 'unit')}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> 按 Unit 生成 (综合课本)
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              bookUnits.map(u => {
                const isSelected = u.unit_number === selectedUnitNum;
                const hasContent = u.has_content || u.content_count > 0;
                const title = u.unit_title || `Unit ${u.unit_number}`;
                const isLesson = title.toLowerCase().includes('lesson') || selectedBook?.name?.toLowerCase().includes('phonics');
                const isChapter = title.toLowerCase().includes('chapter');
                const isStory = title.toLowerCase().includes('story');
                const badgeText = isLesson ? `L${u.unit_number}` : isChapter ? `Ch${u.unit_number}` : isStory ? `St${u.unit_number}` : `U${u.unit_number}`;

                return (
                  <div
                    key={u.unit_number}
                    onClick={() => selectUnit(selectedBookCode, u.unit_number)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between border ${
                      isSelected
                        ? 'bg-primary-600 text-white border-primary-600 shadow-md transform scale-[1.01]'
                        : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-1.5">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {badgeText}
                      </span>

                      {editingUnitNum === u.unit_number ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveUnitTitle(selectedBookCode, u.unit_number, editingUnitTitle);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 flex items-center gap-1"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingUnitTitle}
                            onChange={(e) => setEditingUnitTitle(e.target.value)}
                            onBlur={() => handleSaveUnitTitle(selectedBookCode, u.unit_number, editingUnitTitle)}
                            className="w-full text-xs px-1.5 py-0.5 border border-primary-400 rounded bg-white text-gray-900 focus:outline-none"
                          />
                        </form>
                      ) : (
                        <div className="flex items-center gap-1 min-w-0 flex-1 group/title">
                          <span className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-gray-900'}`} title={title}>
                            {title}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingUnitNum(u.unit_number);
                              setEditingUnitTitle(title);
                            }}
                            className={`opacity-0 group-hover/title:opacity-100 p-0.5 rounded transition-opacity shrink-0 ${
                              isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-700'
                            }`}
                            title="重命名名称"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center">
                      {hasContent ? (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 ${
                          isSelected ? 'bg-white/20 text-white border border-white/20' : 'bg-success-50 text-success-700 border border-success-200'
                        }`}>
                          <CheckCircle className="w-3 h-3" /> 已录入
                        </span>
                      ) : (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                          isSelected ? 'bg-white/10 text-white/80 border-white/20' : 'bg-gray-50 text-gray-400 border-gray-200'
                        }`}>
                          待录入
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================= 第三栏：右侧主工作台 (自适应) ================= */}
        <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden z-0 relative shadow-inner">
          {selectedUnitNum === null || !unitDetail ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-3">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100">
                <FileText className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm font-medium">请在左侧选择需要编辑与提取的教材单元</p>
            </div>
          ) : (
            <>
              {/* 工作区 Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
                  <Badge variant="secondary" className="font-mono text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-lg">
                    {selectedBookCode} · Unit {selectedUnitNum}
                  </Badge>
                  <input
                    type="text"
                    value={unitDetail.unit_title || ''}
                    onChange={(e) => setUnitDetail({ ...unitDetail, unit_title: e.target.value })}
                    placeholder="单元标题 (如: Art Class / Animals)"
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-64 font-bold text-gray-900 bg-gray-50 hover:bg-white transition-colors"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={handleAiExtract}
                    disabled={extracting || (renderedImages.length === 0 && r2Pages.length === 0)}
                    className="border-primary-200 text-primary-700 hover:bg-primary-50 hover:border-primary-300 transition-all font-bold shadow-sm"
                    title="根据左侧已存切图，调用 AI 视觉大模型重新提取并翻译词汇与句型"
                  >
                    {extracting ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2 text-yellow-500" />}
                    {extracting ? '正在 AI 视觉提取...' : '✨ 重新 AI 提取本单元'}
                  </Button>

                  <Button
                    variant="success"
                    onClick={handleSaveUnitContent}
                    disabled={saving}
                    className="font-bold shadow-sm transition-all hover:shadow-md"
                  >
                    {saving ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {saving ? '保存中...' : '💾 保存入库'}
                  </Button>
                </div>
              </div>

              {/* 工作区内容双栏分屏 (左切图预览，右词汇句型) */}
              <div className="flex-1 flex overflow-hidden p-6 gap-6">
                
                {/* 1. 左半屏：PDF 上传与 R2 切图管理 */}
                <Card className="w-1/2 flex flex-col overflow-hidden border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300">
                  <CardHeader className="bg-gray-50/80 border-b border-gray-100 py-3 px-4 shrink-0">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-gray-500" /> 课本原图切片
                        </span>
                        <Badge variant="secondary" className="text-[10px] bg-white border border-gray-200">
                          R2 已存: {r2Pages.length} 页 {renderedImages.length > 0 ? `· 待存: ${renderedImages.length}` : ''}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        {r2Pages.length > 0 && (
                          <Button
                            variant="ghost" size="sm"
                            onClick={handleClearAllPages}
                            className="text-danger-600 hover:text-danger-700 hover:bg-danger-50 px-2 h-7"
                            title="一键清空本单元所有切图 (重新切片)"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> 清空切图
                          </Button>
                        )}

                        <label className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-bold rounded-lg border border-primary-200 hover:bg-primary-100 cursor-pointer transition-colors shadow-sm">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{rendering ? renderProgress : '上传 PDF 切片'}</span>
                          <input
                            type="file" accept="application/pdf"
                            onChange={handlePdfUpload} className="hidden" disabled={rendering}
                          />
                        </label>
                      </div>
                    </div>
                  </CardHeader>

                  {/* 切图网格 */}
                  <div className="flex-1 overflow-y-auto p-5 bg-white">
                    {loadingPages ? (
                      <div className="py-20 text-center text-sm text-gray-400 flex flex-col items-center justify-center gap-3">
                        <Loader className="w-6 h-6 animate-spin text-primary-500" />
                        <span>正在检索 R2 切图...</span>
                      </div>
                    ) : renderedImages.length > 0 ? (
                      <div>
                        <div className="text-sm font-bold text-primary-700 mb-4 flex items-center gap-2 bg-primary-50 p-3 rounded-xl border border-primary-100">
                          <Sparkles className="w-4 h-4 text-primary-500" />
                          <span>本地新切片 ({renderedImages.length} 页) — 点击右上角 AI 识别即可一键入库</span>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                          {renderedImages.map((img, i) => (
                            <div key={i} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow group flex flex-col">
                              <div
                                onClick={() => setPreviewImageModal(img.url)}
                                className="relative h-32 bg-gray-50 flex items-center justify-center cursor-pointer overflow-hidden"
                              >
                                <img src={img.url} alt={`P${i + 1}`} className="w-full h-full object-contain" />
                                <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-sm font-bold gap-2 pointer-events-none backdrop-blur-sm">
                                  <Eye className="w-4 h-4" /> 放大预览
                                </div>
                              </div>
                              <div className="px-3 py-2 bg-white border-t border-gray-100 flex items-center justify-between">
                                <span className="font-bold text-gray-700 text-xs">第 {i + 1} 页</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setRenderedImages(prev => prev.filter((_, idx) => idx !== i)); }}
                                  className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors cursor-pointer"
                                  title="移除此切片"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : r2Pages.length > 0 ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {r2Pages.map(p => (
                          <div key={p.key || p.page_num} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md hover:border-primary-300 transition-all group flex flex-col">
                            <div
                              onClick={() => setPreviewImageModal(p.url)}
                              className="relative h-32 bg-gray-50 flex items-center justify-center cursor-pointer overflow-hidden"
                            >
                              <img src={p.url} alt={`Page ${p.page_num}`} className="w-full h-full object-contain" />
                              <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-sm font-bold gap-2 pointer-events-none backdrop-blur-sm">
                                <Eye className="w-4 h-4" /> 放大预览
                              </div>
                            </div>
                            <div className="px-3 py-2 bg-white border-t border-gray-100 flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">P {p.page_num}</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeletePageImg(p); }}
                                className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors cursor-pointer"
                                title={`删除第 ${p.page_num} 页`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 shadow-inner">
                          <Upload className="w-8 h-8 text-gray-300" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-600 mb-1">该单元暂无切片图片</p>
                          <p className="text-xs text-gray-400">点击右上角「上传 PDF 切片」自动切图并 AI 提取</p>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* 2. 右半屏：结构化教学内容编辑 (Tabs) */}
                <Card className="w-1/2 flex flex-col overflow-hidden border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 bg-white">
                  {/* Tabs */}
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-4 pt-2 shrink-0">
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setActiveTab('vocab')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                          activeTab === 'vocab'
                            ? 'border-primary-600 text-primary-700'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        🔤 核心词汇 
                        <Badge variant={activeTab === 'vocab' ? 'primary' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                          {(unitDetail.vocab || []).length}
                        </Badge>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('patterns')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                          activeTab === 'patterns'
                            ? 'border-primary-600 text-primary-700'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        💬 重点句型
                        <Badge variant={activeTab === 'patterns' ? 'primary' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                          {(unitDetail.patterns || []).length}
                        </Badge>
                      </button>

                      {/* 自然拼读特有 Tab */}
                      {schemaType === 'phonics' && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('phonics')}
                          className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'phonics'
                              ? 'border-primary-600 text-primary-700'
                              : 'border-transparent text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          🔠 拼读与音素
                          <Badge variant={activeTab === 'phonics' ? 'primary' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                            {((unitDetail.extra_content?.letters || []).length) + ((unitDetail.extra_content?.sounds || []).length) + ((unitDetail.extra_content?.blending_words || []).length)}
                          </Badge>
                        </button>
                      )}

                      {/* 分级阅读特有 Tab */}
                      {schemaType === 'graded_reader' && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('reading')}
                          className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'reading'
                              ? 'border-primary-600 text-primary-700'
                              : 'border-transparent text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          📖 故事理解与问答
                          <Badge variant={activeTab === 'reading' ? 'primary' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                            {(unitDetail.extra_content?.comprehension_questions || []).length}
                          </Badge>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setActiveTab('grammar')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                          activeTab === 'grammar'
                            ? 'border-primary-600 text-primary-700'
                            : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        📐 语法焦点
                        <Badge variant={activeTab === 'grammar' ? 'primary' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                          {(unitDetail.grammar || []).length}
                        </Badge>
                      </button>
                    </div>

                    <div className="pb-2">
                      {activeTab === 'vocab' && (
                        <Button variant="ghost" size="sm" onClick={addVocabItem} className="h-8 text-primary-600 hover:bg-primary-50">
                          <Plus className="w-4 h-4 mr-1" /> 添加词汇
                        </Button>
                      )}
                      {activeTab === 'patterns' && (
                        <Button variant="ghost" size="sm" onClick={addPatternItem} className="h-8 text-primary-600 hover:bg-primary-50">
                          <Plus className="w-4 h-4 mr-1" /> 添加句型
                        </Button>
                      )}
                      {activeTab === 'phonics' && (
                        <Button variant="ghost" size="sm" onClick={() => addExtraItem('blending_words', { word: '', translation: '', phonemes: [], is_core: true })} className="h-8 text-primary-600 hover:bg-primary-50">
                          <Plus className="w-4 h-4 mr-1" /> 添加拼读词
                        </Button>
                      )}
                      {activeTab === 'reading' && (
                        <Button variant="ghost" size="sm" onClick={() => addExtraItem('comprehension_questions', { question: '', answer: '', translation: '' })} className="h-8 text-primary-600 hover:bg-primary-50">
                          <Plus className="w-4 h-4 mr-1" /> 添加提问
                        </Button>
                      )}
                      {activeTab === 'grammar' && (
                        <Button variant="ghost" size="sm" onClick={addGrammarItem} className="h-8 text-primary-600 hover:bg-primary-50">
                          <Plus className="w-4 h-4 mr-1" /> 添加语法
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Tab 内容区 */}
                  <div className="flex-1 overflow-y-auto p-5 bg-slate-50/30">
                    {/* 词汇列表 */}
                    {activeTab === 'vocab' && (
                      <div className="space-y-3">
                        {(unitDetail.vocab || []).length === 0 ? (
                          <div className="py-20 text-center text-sm text-gray-400">暂无词汇数据，请点击「添加词汇」或「AI 视觉提取」</div>
                        ) : (
                          (unitDetail.vocab || []).map((v, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow group">
                              <button
                                type="button"
                                onClick={() => updateVocabItem(i, 'is_core', !v.is_core)}
                                className={`text-xs px-2 py-1 rounded-lg font-bold transition-colors ${
                                  v.is_core ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-gray-100 text-gray-500 border border-gray-200'
                                }`}
                                title="切换是否为核心重点词"
                              >
                                {v.is_core ? '⭐ 核心' : '普通'}
                              </button>

                              <input
                                type="text"
                                value={v.word || ''}
                                onChange={(e) => updateVocabItem(i, 'word', e.target.value)}
                                placeholder="英文单词"
                                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900 transition-colors"
                              />

                              <input
                                type="text"
                                value={v.translation || ''}
                                onChange={(e) => updateVocabItem(i, 'translation', e.target.value)}
                                placeholder="中文释义"
                                className="w-40 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none text-gray-700 transition-colors"
                              />

                              <button
                                type="button"
                                onClick={() => removeVocabItem(i)}
                                className="p-2 text-gray-300 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* 句型列表 */}
                    {activeTab === 'patterns' && (
                      <div className="space-y-3">
                        {(unitDetail.patterns || []).length === 0 ? (
                          <div className="py-20 text-center text-sm text-gray-400">暂无句型数据，请点击「添加句型」或「AI 视觉提取」</div>
                        ) : (
                          (unitDetail.patterns || []).map((p, i) => (
                            <div key={i} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow space-y-3 group relative">
                              <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 font-bold">句型 {i + 1}</Badge>
                                <button
                                  type="button"
                                  onClick={() => removePatternItem(i)}
                                  className="p-1.5 text-gray-300 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={p.pattern || ''}
                                onChange={(e) => updatePatternItem(i, 'pattern', e.target.value)}
                                placeholder="英文句型 (如: I have a pencil.)"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900 transition-colors"
                              />
                              <input
                                type="text"
                                value={p.translation || ''}
                                onChange={(e) => updatePatternItem(i, 'translation', e.target.value)}
                                placeholder="中文翻译 (如: 我有一支铅笔。)"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none text-gray-700 transition-colors"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* 自然拼读内容区 */}
                    {activeTab === 'phonics' && (
                      <div className="space-y-5">
                        {/* 1. 目标字母 (Letters) */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                              🔤 目标字母 (Letters)
                              <Badge variant="secondary" className="text-[10px]">{(unitDetail.extra_content?.letters || []).length}</Badge>
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => addExtraItem('letters', { letter: '', sound: '', uppercase: '', lowercase: '' })} className="h-7 text-xs text-primary-600">
                              <Plus className="w-3.5 h-3.5 mr-1" /> 加字母
                            </Button>
                          </div>
                          {(unitDetail.extra_content?.letters || []).length === 0 ? (
                            <div className="text-xs text-gray-400 py-2">暂无目标字母，点击右上角添加或重新 AI 提取</div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {(unitDetail.extra_content?.letters || []).map((l, i) => (
                                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                  <input
                                    type="text"
                                    value={l.letter || ''}
                                    onChange={e => updateExtraField('letters', i, 'letter', e.target.value)}
                                    placeholder="字母 Aa"
                                    className="w-16 px-2 py-1 text-xs border border-gray-200 rounded bg-white font-bold"
                                  />
                                  <input
                                    type="text"
                                    value={l.sound || ''}
                                    onChange={e => updateExtraField('letters', i, 'sound', e.target.value)}
                                    placeholder="发音 /æ/"
                                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white text-gray-600"
                                  />
                                  <button onClick={() => removeExtraItem('letters', i)} className="text-gray-300 hover:text-danger-600 p-1">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. 发音规律 (Sounds) */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                              🔊 音素与发音规律 (Sounds & Rules)
                              <Badge variant="secondary" className="text-[10px]">{(unitDetail.extra_content?.sounds || []).length}</Badge>
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => addExtraItem('sounds', { sound: '', phonics_rule: '', example_words: [] })} className="h-7 text-xs text-primary-600">
                              <Plus className="w-3.5 h-3.5 mr-1" /> 加音素
                            </Button>
                          </div>
                          {(unitDetail.extra_content?.sounds || []).length === 0 ? (
                            <div className="text-xs text-gray-400 py-2">暂无音素规律</div>
                          ) : (
                            <div className="space-y-2">
                              {(unitDetail.extra_content?.sounds || []).map((s, i) => (
                                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                  <input
                                    type="text"
                                    value={s.sound || ''}
                                    onChange={e => updateExtraField('sounds', i, 'sound', e.target.value)}
                                    placeholder="音标 /æ/"
                                    className="w-20 px-2 py-1 text-xs border border-gray-200 rounded bg-white font-bold"
                                  />
                                  <input
                                    type="text"
                                    value={s.phonics_rule || ''}
                                    onChange={e => updateExtraField('sounds', i, 'phonics_rule', e.target.value)}
                                    placeholder="拼读发音规律描述"
                                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white text-gray-700"
                                  />
                                  <button onClick={() => removeExtraItem('sounds', i)} className="text-gray-300 hover:text-danger-600 p-1">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 3. 拼读拆分生词 (Blending Words) */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                              🧩 拼读目标生词 (Blending Words)
                              <Badge variant="secondary" className="text-[10px]">{(unitDetail.extra_content?.blending_words || []).length}</Badge>
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => addExtraItem('blending_words', { word: '', translation: '', phonemes: [], is_core: true })} className="h-7 text-xs text-primary-600">
                              <Plus className="w-3.5 h-3.5 mr-1" /> 加拼读词
                            </Button>
                          </div>
                          {(unitDetail.extra_content?.blending_words || []).length === 0 ? (
                            <div className="text-xs text-gray-400 py-2">暂无拼读词汇</div>
                          ) : (
                            <div className="space-y-2">
                              {(unitDetail.extra_content?.blending_words || []).map((b, i) => (
                                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                  <input
                                    type="text"
                                    value={b.word || ''}
                                    onChange={e => updateExtraField('blending_words', i, 'word', e.target.value)}
                                    placeholder="单词 cat"
                                    className="w-28 px-2 py-1 text-xs border border-gray-200 rounded bg-white font-bold"
                                  />
                                  <input
                                    type="text"
                                    value={b.translation || ''}
                                    onChange={e => updateExtraField('blending_words', i, 'translation', e.target.value)}
                                    placeholder="中文翻译 猫"
                                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white text-gray-700"
                                  />
                                  <input
                                    type="text"
                                    value={Array.isArray(b.phonemes) ? b.phonemes.join('-') : (b.phonemes || '')}
                                    onChange={e => updateExtraField('blending_words', i, 'phonemes', e.target.value.split('-').map(x => x.trim()).filter(Boolean))}
                                    placeholder="音素拆分 c-a-t"
                                    className="w-28 px-2 py-1 text-xs border border-gray-200 rounded bg-white font-mono text-gray-500"
                                  />
                                  <button onClick={() => removeExtraItem('blending_words', i)} className="text-gray-300 hover:text-danger-600 p-1">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 4. 视读词 (Sight Words) */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                              👀 常见视读词 (Sight Words)
                              <Badge variant="secondary" className="text-[10px]">{(unitDetail.extra_content?.sight_words || []).length}</Badge>
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => addExtraItem('sight_words', { word: '', translation: '' })} className="h-7 text-xs text-primary-600">
                              <Plus className="w-3.5 h-3.5 mr-1" /> 加视读词
                            </Button>
                          </div>
                          {(unitDetail.extra_content?.sight_words || []).length === 0 ? (
                            <div className="text-xs text-gray-400 py-2">暂无视读词</div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {(unitDetail.extra_content?.sight_words || []).map((sw, i) => (
                                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                  <input
                                    type="text"
                                    value={sw.word || ''}
                                    onChange={e => updateExtraField('sight_words', i, 'word', e.target.value)}
                                    placeholder="the"
                                    className="w-20 px-2 py-1 text-xs border border-gray-200 rounded bg-white font-bold"
                                  />
                                  <input
                                    type="text"
                                    value={sw.translation || ''}
                                    onChange={e => updateExtraField('sight_words', i, 'translation', e.target.value)}
                                    placeholder="释义"
                                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white text-gray-600"
                                  />
                                  <button onClick={() => removeExtraItem('sight_words', i)} className="text-gray-300 hover:text-danger-600 p-1">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 分级阅读内容区 */}
                    {activeTab === 'reading' && (
                      <div className="space-y-4">
                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
                          <label className="block text-xs font-bold text-gray-700">📖 故事核心概要 (Story Summary)</label>
                          <textarea
                            value={unitDetail.extra_content?.story_summary || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setUnitDetail(prev => ({
                                ...prev,
                                extra_content: { ...(prev.extra_content || {}), story_summary: val }
                              }));
                            }}
                            rows={3}
                            placeholder="填写或由 AI 提取的故事梗概与核心大意..."
                            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                          />
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800">❓ 故事理解与互动问答</span>
                            <Button variant="ghost" size="sm" onClick={() => addExtraItem('comprehension_questions', { question: '', answer: '', translation: '' })} className="h-7 text-xs text-primary-600">
                              <Plus className="w-3.5 h-3.5 mr-1" /> 加提问
                            </Button>
                          </div>
                          {(unitDetail.extra_content?.comprehension_questions || []).length === 0 ? (
                            <div className="text-xs text-gray-400 py-4 text-center">暂无绘本问答要点</div>
                          ) : (
                            (unitDetail.extra_content?.comprehension_questions || []).map((q, i) => (
                              <div key={i} className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                                <div className="flex items-center justify-between">
                                  <Badge variant="secondary" className="text-[10px]">问答 {i + 1}</Badge>
                                  <button onClick={() => removeExtraItem('comprehension_questions', i)} className="text-gray-300 hover:text-danger-600 p-1">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={q.question || ''}
                                  onChange={e => updateExtraField('comprehension_questions', i, 'question', e.target.value)}
                                  placeholder="英文提问 (What did the rabbit do?)"
                                  className="w-full px-2.5 py-1 text-xs border border-gray-200 rounded bg-white font-bold"
                                />
                                <input
                                  type="text"
                                  value={q.answer || ''}
                                  onChange={e => updateExtraField('comprehension_questions', i, 'answer', e.target.value)}
                                  placeholder="参考答案 (It hopped away.)"
                                  className="w-full px-2.5 py-1 text-xs border border-gray-200 rounded bg-white text-gray-700"
                                />
                                <input
                                  type="text"
                                  value={q.translation || ''}
                                  onChange={e => updateExtraField('comprehension_questions', i, 'translation', e.target.value)}
                                  placeholder="中文翻译 (兔子做了什么？)"
                                  className="w-full px-2.5 py-1 text-xs border border-gray-200 rounded bg-white text-gray-500"
                                />
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* 语法列表 */}
                    {activeTab === 'grammar' && (
                      <div className="space-y-3">
                        {(unitDetail.grammar || []).length === 0 ? (
                          <div className="py-20 text-center text-sm text-gray-400">暂无语法数据，请点击「添加语法」或「AI 视觉提取」</div>
                        ) : (
                          (unitDetail.grammar || []).map((g, i) => (
                            <div key={i} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow space-y-3 group relative">
                              <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">语法点 {i + 1}</Badge>
                                <button
                                  type="button"
                                  onClick={() => removeGrammarItem(i)}
                                  className="p-1.5 text-gray-300 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={g.point || ''}
                                onChange={(e) => updateGrammarItem(i, 'point', e.target.value)}
                                placeholder="语法要点 (如: Simple Present / Countable Nouns)"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900 transition-colors"
                              />
                              <input
                                type="text"
                                value={g.example || ''}
                                onChange={(e) => updateGrammarItem(i, 'example', e.target.value)}
                                placeholder="例句 (如: Do you have paper? Yes, I do.)"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none text-gray-700 transition-colors"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </Card>

              </div>
            </>
          )}
        </div>

      </div>

      {/* 图片放大灯箱 Modal */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div className="relative max-w-5xl max-h-[95vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImageModal(null)}
              className="absolute top-4 right-4 bg-black/60 text-white rounded-full p-2 hover:bg-black/90 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewImageModal} alt="Preview" className="max-h-[90vh] w-auto mx-auto object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* 整本 PDF 批量导入 Modal */}
      {showBatchBookModal && selectedBookCode && (
        <BatchBookImportModal
          bookCode={selectedBookCode}
          bookName={selectedBook?.name || selectedBookCode}
          bookSchema={selectedBook?.content_schema}
          llmConfig={llmConfig}
          onClose={() => {
            setShowBatchBookModal(false);
            selectBook(selectedBookCode);
          }}
        />
      )}

      {/* AI 视觉模型设置 Modal */}
      {showLlmSettingsModal && (
        <LlmSettingsModal
          config={llmConfig}
          onSave={saveLlmConfig}
          onClose={() => setShowLlmSettingsModal(false)}
        />
      )}

      {/* 教材库管理 Modal */}
      {showBooksManage && (
        <BooksManageModal
          books={books}
          onClose={() => {
            setShowBooksManage(false);
            loadBooks();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// 📖 目录大纲驱动 · 真实印刷页码精准对齐导入器
// ============================================================
const DEFAULT_OUTLINES = {
  'EU-S': [
    { unit_number: 0, unit_title: 'Welcome', page_from: 2, page_to: 3 },
    { unit_number: 1, unit_title: 'Art Class', page_from: 4, page_to: 11 },
    { unit_number: 2, unit_title: "Let's Play", page_from: 12, page_to: 19 },
    { unit_number: 3, unit_title: 'Many Colors', page_from: 22, page_to: 29 },
    { unit_number: 4, unit_title: 'Counting', page_from: 30, page_to: 37 },
    { unit_number: 5, unit_title: 'Animals', page_from: 40, page_to: 47 },
    { unit_number: 6, unit_title: 'Lunch', page_from: 48, page_to: 55 },
    { unit_number: 7, unit_title: 'Things to Do', page_from: 58, page_to: 65 },
    { unit_number: 8, unit_title: 'My Body', page_from: 66, page_to: 73 }
  ],
  'WE-P': [
    { unit_number: 0, unit_title: 'The Alphabet Song', page_from: 4, page_to: 7 },
    { unit_number: 1, unit_title: 'Lesson 1: Aa · Bb · Cc', page_from: 8, page_to: 13 },
    { unit_number: 2, unit_title: 'Lesson 2: Dd · Ee · Ff', page_from: 14, page_to: 19 },
    { unit_number: 3, unit_title: 'Lesson 3: Review 1', page_from: 20, page_to: 23 },
    { unit_number: 4, unit_title: 'Lesson 4: Gg · Hh · Ii', page_from: 24, page_to: 29 },
    { unit_number: 5, unit_title: 'Lesson 5: Jj · Kk · Ll', page_from: 30, page_to: 35 },
    { unit_number: 6, unit_title: 'Lesson 6: Review 2', page_from: 36, page_to: 39 },
    { unit_number: 7, unit_title: 'Lesson 7: Review 3', page_from: 40, page_to: 43 },
    { unit_number: 8, unit_title: 'Lesson 8: Progress Test 1', page_from: 44, page_to: 47 },
    { unit_number: 9, unit_title: 'Lesson 9: Mm · Nn · Oo', page_from: 48, page_to: 53 },
    { unit_number: 10, unit_title: 'Lesson 10: Pp · Qq · Rr', page_from: 54, page_to: 59 },
    { unit_number: 11, unit_title: 'Lesson 11: Review 4', page_from: 60, page_to: 63 },
    { unit_number: 12, unit_title: 'Lesson 12: Ss · Tt · Uu · Vv', page_from: 64, page_to: 69 },
    { unit_number: 13, unit_title: 'Lesson 13: Ww · Xx · Yy · Zz', page_from: 70, page_to: 75 },
    { unit_number: 14, unit_title: 'Lesson 14: Review 5', page_from: 76, page_to: 79 },
    { unit_number: 15, unit_title: 'Lesson 15: Review 6', page_from: 80, page_to: 83 },
    { unit_number: 16, unit_title: 'Lesson 16: Progress Test 2', page_from: 84, page_to: 87 },
    { unit_number: 17, unit_title: 'The Phonics Song', page_from: 88, page_to: 89 },
    { unit_number: 18, unit_title: 'Picture Bank', page_from: 90, page_to: 91 }
  ],
  'WE_P3': [
    { unit_number: 1, unit_title: 'Lesson 1: Consonant Blends: bl · cl · fl', page_from: 6, page_to: 11 },
    { unit_number: 2, unit_title: 'Lesson 2: Consonant Blends: gl · pl · sl', page_from: 12, page_to: 17 },
    { unit_number: 3, unit_title: 'Lesson 3: Review 1', page_from: 18, page_to: 21 },
    { unit_number: 4, unit_title: 'Lesson 4: Consonant Blends: br · cr · fr', page_from: 22, page_to: 27 },
    { unit_number: 5, unit_title: 'Lesson 5: Consonant Blends: dr · pr · tr', page_from: 28, page_to: 33 },
    { unit_number: 6, unit_title: 'Lesson 6: Review 2', page_from: 34, page_to: 37 },
    { unit_number: 7, unit_title: 'Lesson 7: Consonant Blends: sm · sn', page_from: 38, page_to: 43 },
    { unit_number: 8, unit_title: 'Lesson 8: Consonant Blends: st · sw', page_from: 44, page_to: 49 },
    { unit_number: 9, unit_title: 'Lesson 9: Review 3', page_from: 50, page_to: 53 },
    { unit_number: 10, unit_title: 'Lesson 10: Consonant Blends: nd · nt', page_from: 54, page_to: 59 },
    { unit_number: 11, unit_title: 'Lesson 11: Consonant Digraph & Blend: ng · nk', page_from: 60, page_to: 65 },
    { unit_number: 12, unit_title: 'Lesson 12: Review 4', page_from: 66, page_to: 69 },
    { unit_number: 13, unit_title: 'Lesson 13: Consonant Digraphs: ch · sh', page_from: 70, page_to: 75 },
    { unit_number: 14, unit_title: 'Lesson 14: Consonant Digraphs: ph · th · wh', page_from: 76, page_to: 81 },
    { unit_number: 15, unit_title: 'Lesson 15: Review 5', page_from: 82, page_to: 85 },
    { unit_number: 16, unit_title: 'Lesson 16: Progress Test', page_from: 86, page_to: 89 },
    { unit_number: 17, unit_title: 'Word Bank', page_from: 90, page_to: 91 }
  ],
  'WE-P3': [
    { unit_number: 1, unit_title: 'Lesson 1: Consonant Blends: bl · cl · fl', page_from: 6, page_to: 11 },
    { unit_number: 2, unit_title: 'Lesson 2: Consonant Blends: gl · pl · sl', page_from: 12, page_to: 17 },
    { unit_number: 3, unit_title: 'Lesson 3: Review 1', page_from: 18, page_to: 21 },
    { unit_number: 4, unit_title: 'Lesson 4: Consonant Blends: br · cr · fr', page_from: 22, page_to: 27 },
    { unit_number: 5, unit_title: 'Lesson 5: Consonant Blends: dr · pr · tr', page_from: 28, page_to: 33 },
    { unit_number: 6, unit_title: 'Lesson 6: Review 2', page_from: 34, page_to: 37 },
    { unit_number: 7, unit_title: 'Lesson 7: Consonant Blends: sm · sn', page_from: 38, page_to: 43 },
    { unit_number: 8, unit_title: 'Lesson 8: Consonant Blends: st · sw', page_from: 44, page_to: 49 },
    { unit_number: 9, unit_title: 'Lesson 9: Review 3', page_from: 50, page_to: 53 },
    { unit_number: 10, unit_title: 'Lesson 10: Consonant Blends: nd · nt', page_from: 54, page_to: 59 },
    { unit_number: 11, unit_title: 'Lesson 11: Consonant Digraph & Blend: ng · nk', page_from: 60, page_to: 65 },
    { unit_number: 12, unit_title: 'Lesson 12: Review 4', page_from: 66, page_to: 69 },
    { unit_number: 13, unit_title: 'Lesson 13: Consonant Digraphs: ch · sh', page_from: 70, page_to: 75 },
    { unit_number: 14, unit_title: 'Lesson 14: Consonant Digraphs: ph · th · wh', page_from: 76, page_to: 81 },
    { unit_number: 15, unit_title: 'Lesson 15: Review 5', page_from: 82, page_to: 85 },
    { unit_number: 16, unit_title: 'Lesson 16: Progress Test', page_from: 86, page_to: 89 },
    { unit_number: 17, unit_title: 'Word Bank', page_from: 90, page_to: 91 }
  ],
  'DEFAULT': [
    { unit_number: 0, unit_title: 'Welcome / Starter', page_from: 2, page_to: 3 },
    { unit_number: 1, unit_title: 'Unit 1', page_from: 4, page_to: 11 },
    { unit_number: 2, unit_title: 'Unit 2', page_from: 12, page_to: 19 },
    { unit_number: 3, unit_title: 'Unit 3', page_from: 22, page_to: 29 },
    { unit_number: 4, unit_title: 'Unit 4', page_from: 30, page_to: 37 },
    { unit_number: 5, unit_title: 'Unit 5', page_from: 40, page_to: 47 },
    { unit_number: 6, unit_title: 'Unit 6', page_from: 48, page_to: 55 },
    { unit_number: 7, unit_title: 'Unit 7', page_from: 58, page_to: 65 },
    { unit_number: 8, unit_title: 'Unit 8', page_from: 66, page_to: 73 }
  ]
};

function BatchBookImportModal({ bookCode, bookName, bookSchema, llmConfig, onClose }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  
  // 页码偏移量 (PDF 真实页码 = 课本印刷页码 + pageOffset)
  // 若课本第 6 页在 PDF 中就是第 6 页，则 offset = 0
  const isPhonics = bookCode?.includes('P') || bookCode?.toLowerCase().includes('phonics');
  const [pageOffset, setPageOffset] = useState(isPhonics ? 0 : 2);
  const [previewThumbnail, setPreviewThumbnail] = useState(null);
  const [previewingPdfPage, setPreviewingPdfPage] = useState(isPhonics ? 6 : 4);

  // 单元目录大纲列表
  const [outline, setOutline] = useState(() => {
    const preset = DEFAULT_OUTLINES[bookCode] || DEFAULT_OUTLINES['DEFAULT'];
    return preset.map(u => ({ ...u, selected: true, status: 'idle', vocabCount: 0, patternCount: 0, extraCount: 0, extractedData: null }));
  });

  const [processing, setProcessing] = useState(false);
  const [slicingUnits, setSlicingUnits] = useState(false);
  const [extractingAi, setExtractingAi] = useState(false);
  const [previewSliceModal, setPreviewSliceModal] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [detectingToc, setDetectingToc] = useState(false);
  const [currentProcessingUnit, setCurrentProcessingUnit] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [showTocPicker, setShowTocPicker] = useState(false);
  const [tocStartPage, setTocStartPage] = useState(6);
  const [tocEndPage, setTocEndPage] = useState(8);
  const [tocSampleThumb, setTocSampleThumb] = useState(null);

  const renderTocSample = async (doc, pageNum) => {
    if (!doc || pageNum < 1 || pageNum > doc.numPages) return;
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.6 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
      if (tocSampleThumb) URL.revokeObjectURL(tocSampleThumb);
      setTocSampleThumb(URL.createObjectURL(blob));
    } catch (e) {
      console.warn(e);
    }
  };

  const [showRuleGenerator, setShowRuleGenerator] = useState(false);
  const [ruleConfig, setRuleConfig] = useState({
    prefix: 'Lesson',
    totalCount: 16,
    startPage: 4,
    pagesPerLesson: 4,
    includeWelcome: false
  });

  // 按规则一键排课生成大纲
  const handleGenerateOutlineByRule = () => {
    const list = [];
    let curPage = parseInt(ruleConfig.startPage) || 1;
    const pCount = parseInt(ruleConfig.pagesPerLesson) || 4;
    const total = parseInt(ruleConfig.totalCount) || 12;

    if (ruleConfig.includeWelcome) {
      list.push({
        unit_number: 0,
        unit_title: 'Welcome / Starter',
        page_from: Math.max(1, curPage - 2),
        page_to: Math.max(1, curPage - 1),
        selected: true,
        status: 'idle',
        vocabCount: 0,
        patternCount: 0,
        extraCount: 0,
        extractedData: null
      });
    }

    for (let i = 1; i <= total; i++) {
      const pFrom = curPage;
      const pTo = curPage + pCount - 1;
      list.push({
        unit_number: i,
        unit_title: `${ruleConfig.prefix} ${i}`,
        page_from: pFrom,
        page_to: pTo,
        selected: true,
        status: 'idle',
        vocabCount: 0,
        patternCount: 0,
        extraCount: 0,
        extractedData: null
      });
      curPage = pTo + 1;
    }

    setOutline(list);
    setShowRuleGenerator(false);
    setStatusMsg(`✅ 已按规律生成 ${list.length} 个 ${ruleConfig.prefix} 大纲，每课 ${pCount} 页，可核对或微调`);
  };

  // 1. 本地文本层极速关键词扫描与智能分页 (Unit / Lesson / Chapter / Story)
  const scanKeywordsAndPaginate = async (doc) => {
    if (!doc) return;
    setDetectingToc(true);
    setStatusMsg('🔍 正在智能扫描全书文本关键词 (Lesson / Unit / Chapter / Story / Review)...');

    try {
      const candidates = [];
      const numPages = doc.numPages;

      const WORD_NUMS = {
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
      };

      const unitRegex = /\b(?:Lesson|Unit|Chapter|Story|Part)\s*[:\-]?\s*([0-9A-Za-z]+)\b/i;
      const specialRegex = /\b(Welcome|Starter|Review|Phonics|Phonics\s*Time)\s*([0-9A-Za-z]*)\b/i;

      for (let p = 1; p <= numPages; p++) {
        const page = await doc.getPage(p);
        const textContent = await page.getTextContent();
        const fullPageText = textContent.items.map(it => it.str).join(' ');

        const unitMatch = fullPageText.match(unitRegex);
        const specialMatch = fullPageText.match(specialRegex);

        if (unitMatch || specialMatch) {
          let identifier = '';
          let unitNumber = 0;
          let title = '';

          if (unitMatch) {
            const raw = (unitMatch[1] || '').toLowerCase();
            unitNumber = WORD_NUMS[raw] !== undefined ? WORD_NUMS[raw] : parseInt(raw, 10);
            if (isNaN(unitNumber)) unitNumber = candidates.length + 1;
            identifier = unitMatch[0];
          } else if (specialMatch) {
            const tag = specialMatch[1];
            const raw = (specialMatch[2] || '').toLowerCase();
            const num = WORD_NUMS[raw] !== undefined ? WORD_NUMS[raw] : (parseInt(raw, 10) || 0);
            if (tag.toLowerCase().includes('welcome') || tag.toLowerCase().includes('starter')) {
              unitNumber = 0;
            } else {
              unitNumber = num || (candidates.length + 1);
            }
            identifier = specialMatch[0];
          }

          // 抓取标题文本
          const idx = fullPageText.indexOf(identifier);
          if (idx !== -1) {
            const snippet = fullPageText.substring(idx + identifier.length, idx + identifier.length + 45).trim();
            const cleanTitle = snippet.split(/[\r\n\.\?]/)[0]?.trim();
            if (cleanTitle && cleanTitle.length > 2 && cleanTitle.length < 35) {
              title = `${identifier}: ${cleanTitle}`;
            } else {
              title = identifier;
            }
          } else {
            title = identifier;
          }

          // 防抖防重：避免同课内重复出现关键词导致频繁切分
          const lastCandidate = candidates[candidates.length - 1];
          if (!lastCandidate || (p - lastCandidate.pdfPage >= 2 && lastCandidate.unit_number !== unitNumber)) {
            candidates.push({
              unit_number: unitNumber,
              unit_title: title,
              pdfPage: p
            });
          }
        }
      }

      if (candidates.length > 0) {
        // 自动计算或建议 offset (基于第 1 课的物理页)
        const firstPdfPage = candidates[0].pdfPage;
        const suggestedOffset = Math.max(0, firstPdfPage - (candidates[0].unit_number === 0 ? 2 : 4));
        setPageOffset(suggestedOffset);

        const newOutline = candidates.map((c, i) => {
          const nextCandidate = candidates[i + 1];
          const pdfEnd = nextCandidate ? nextCandidate.pdfPage - 1 : Math.min(c.pdfPage + 5, numPages);
          
          return {
            unit_number: c.unit_number,
            unit_title: c.unit_title,
            page_from: Math.max(1, c.pdfPage - suggestedOffset),
            page_to: Math.max(1, pdfEnd - suggestedOffset),
            selected: true,
            status: 'idle',
            vocabCount: 0,
            patternCount: 0,
            extraCount: 0,
            extractedData: null
          };
        });

        setOutline(newOutline);
        setStatusMsg(`✨ 智能关键词扫描成功！已自动识别 ${newOutline.length} 个课时/单元，请核对下方大纲`);
        renderOffsetSample(doc, 2 + suggestedOffset);
      } else {
        setStatusMsg('💡 本地文本层未检测到章节标识，建议点击【🤖 AI 视觉扫描目录】或【📐 规律排课生成】');
      }
    } catch (err) {
      console.warn('Scan keywords err:', err);
      setStatusMsg('本地关键词扫描完成，已保留默认大纲');
    }
    setDetectingToc(false);
  };

  // 2. 截取用户指定页码范围的目录页，拼接成单张全景图并调用后端 AI 视觉模型深度识别
  const handleAiTocDetection = async (overrideStart, overrideEnd) => {
    if (!pdfDoc) return;
    setDetectingToc(true);

    const fromP = Math.max(1, overrideStart || parseInt(tocStartPage) || 6);
    const toP = Math.min(pdfDoc.numPages, Math.max(fromP, overrideEnd || parseInt(tocEndPage) || fromP + 2));

    setStatusMsg(`🤖 正在截取 PDF 第 ${fromP}-${toP} 页目录并合成全景图调用 AI 视觉深度解析...`);

    try {
      const pageCanvases = [];
      let tocText = '';

      for (let p = fromP; p <= toP; p++) {
        const page = await pdfDoc.getPage(p);
        try {
          const textContent = await page.getTextContent();
          const pText = textContent.items.map(it => it.str).join(' ');
          if (pText.trim()) {
            tocText += `\n--- Page ${p} ---\n` + pText;
          }
        } catch (e) {}

        const viewport = page.getViewport({ scale: 1.1 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageCanvases.push(canvas);
      }

      // 将扫描到的目录页合成为 1 张双栏大图，严密遵从 NVIDIA NIM 的单图输入限制
      let singleCollageBase64 = null;
      if (pageCanvases.length > 0) {
        const cols = pageCanvases.length <= 2 ? pageCanvases.length : 2;
        const rows = Math.ceil(pageCanvases.length / cols);
        const cellW = 800;
        const cellH = Math.round((pageCanvases[0].height / pageCanvases[0].width) * cellW);

        const collageCanvas = document.createElement('canvas');
        collageCanvas.width = cellW * cols;
        collageCanvas.height = cellH * rows;
        const cCtx = collageCanvas.getContext('2d');
        cCtx.fillStyle = '#ffffff';
        cCtx.fillRect(0, 0, collageCanvas.width, collageCanvas.height);

        pageCanvases.forEach((canv, idx) => {
          const c = idx % cols;
          const r = Math.floor(idx / cols);
          cCtx.drawImage(canv, c * cellW, r * cellH, cellW, cellH);
        });

        const blob = await new Promise(res => collageCanvas.toBlob(res, 'image/jpeg', 0.85));
        singleCollageBase64 = await new Promise(res => {
          const reader = new FileReader();
          reader.onloadend = () => res(reader.result);
          reader.readAsDataURL(blob);
        });
      }

      const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      };
      if (llmConfig?.baseUrl) headers['X-LLM-Base-Url'] = llmConfig.baseUrl;
      if (llmConfig?.apiKey) headers['X-LLM-Api-Key'] = llmConfig.apiKey;
      if (llmConfig?.model) headers['X-LLM-Model'] = llmConfig.model;

      const resp = await fetch(`${API_BASE_URL}/textbooks/detect-toc/${bookCode}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: tocText,
          images: singleCollageBase64 ? [singleCollageBase64] : [],
          llm_base_url: llmConfig?.baseUrl,
          llm_api_key: llmConfig?.apiKey,
          llm_model: llmConfig?.model
        })
      });
      const json = await resp.json();

      if (json.data?.units && json.data.units.length > 0) {
        const hasLessonKeyword = isPhonics || json.data.units.some(x => (x.unit_title || '').toLowerCase().includes('lesson'));
        const detected = json.data.units.map((u, i) => {
          const rawTitle = u.unit_title || '';
          return {
            unit_number: u.unit_number !== undefined ? u.unit_number : i + 1,
            unit_title: rawTitle || (hasLessonKeyword ? `Lesson ${u.unit_number}` : `Unit ${u.unit_number}`),
            page_from: parseInt(u.page_from) || 4,
            page_to: parseInt(u.page_to) || (parseInt(u.page_from) + 3 || 7),
            selected: true,
            status: 'idle',
            vocabCount: 0,
            patternCount: 0,
            extraCount: 0,
            extractedData: null
          };
        });

        // 核心消除重叠页：若后一课从 N 页开始，前一课必须在 N - 1 结束！
        for (let i = 0; i < detected.length - 1; i++) {
          if (detected[i + 1].page_from > detected[i].page_from) {
            detected[i].page_to = detected[i + 1].page_from - 1;
          }
        }

        // 自动计算建议 offset
        if (detected.length > 0) {
          const firstFrom = detected[0].page_from;
          // 若目录在第 5-8 页且第一课印刷页小于等于目录结束页，说明 PDF 真实物理页码与印刷页码一致 (offset = 0)
          let estOffset = 0;
          if (firstFrom > toP) {
            estOffset = Math.max(0, toP + 1 - firstFrom);
          } else {
            estOffset = 0;
          }
          setPageOffset(estOffset);
          renderOffsetSample(pdfDoc, (detected[1]?.page_from || firstFrom) + estOffset);
        }

        setOutline(detected);
        setShowTocPicker(false);
        setStatusMsg(`🎉 AI 视觉目录解析成功！已提取 ${detected.length} 个课时/单元，并已自动对齐页码偏移量`);
      } else {
        const msg = json.error?.message || '未在指定目录页中识别到明确课时列表';
        alert(`AI 目录解析提示: ${msg}\n\n请确认目录页码范围是否准确（当前扫描第 ${fromP}-${toP} 页），或使用【📐 规律排课生成】！`);
      }
    } catch (err) {
      alert('AI 目录扫描失败: ' + err.message);
    }
    setDetectingToc(false);
  };

  // 加载 PDF 文件并触发极速关键词扫描
  const handleSelectBookPdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingPdf(true);
    setStatusMsg('正在解析 PDF 文件...');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;

      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setStatusMsg(`PDF 加载成功！共 ${doc.numPages} 页，正在进行智能目录初筛...`);
      
      // 快速探测目录在第几页 (扫描前 15 页寻找 Contents / Table of Contents)
      let foundTocPage = 6;
      for (let p = 1; p <= Math.min(15, doc.numPages); p++) {
        try {
          const pg = await doc.getPage(p);
          const tc = await pg.getTextContent();
          const str = tc.items.map(it => it.str).join(' ');
          if (/(?:Table\s*of\s*Contents|Contents|Scope\s*&?\s*Sequence|Syllabus)/i.test(str)) {
            foundTocPage = p;
            break;
          }
        } catch (e) {}
      }
      setTocStartPage(foundTocPage);
      setTocEndPage(Math.min(doc.numPages, foundTocPage + 2));
      renderTocSample(doc, foundTocPage);

      // 渲染校准对照图 (默认取 PDF 第 4 页)
      renderOffsetSample(doc, 2 + pageOffset);

      // 立即触发文本关键词初筛分页
      await scanKeywordsAndPaginate(doc);
    } catch (err) {
      if (err.message && (err.message.includes('dynamically imported module') || err.message.includes('MIME type'))) {
        if (confirm('系统刚刚部署了新版本，需要刷新浏览器以载入最新解析模块。是否立即刷新？')) {
          window.location.reload();
          return;
        }
      }
      alert('加载整本 PDF 失败: ' + err.message);
    } finally {
      setLoadingPdf(false);
      setProcessing(false);
    }
  };

  // 渲染指定 PDF 页面的缩略图供肉眼核对
  const renderOffsetSample = async (doc, pdfPageNum) => {
    if (!doc || pdfPageNum < 1 || pdfPageNum > doc.numPages) return;
    try {
      setPreviewingPdfPage(pdfPageNum);
      const page = await doc.getPage(pdfPageNum);
      const viewport = page.getViewport({ scale: 0.8 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.8));
      if (previewThumbnail) URL.revokeObjectURL(previewThumbnail);
      setPreviewThumbnail(URL.createObjectURL(blob));
    } catch (e) {
      console.error(e);
    }
  };

  // 调整偏移量
  const handleOffsetChange = (newOffset) => {
    const off = Math.max(0, newOffset);
    setPageOffset(off);
    if (pdfDoc) {
      renderOffsetSample(pdfDoc, 2 + off);
    }
  };

  // 大纲单行修改
  const updateOutlineItem = (index, field, val) => {
    setOutline(prev => {
      const list = [...prev];
      list[index] = { ...list[index], [field]: val };
      // 智能联动：如果修改了本课起始页，且前一课结束页大于等于本课起始页，则自动把前一课结束页调整为 val - 1
      if (field === 'page_from' && index > 0 && typeof val === 'number') {
        if (list[index - 1].page_to >= val) {
          list[index - 1] = { ...list[index - 1], page_to: Math.max(list[index - 1].page_from, val - 1) };
        }
      }
      return list;
    });
  };

  // 新增自定义单元
  const addOutlineUnit = () => {
    setOutline(prev => {
      const last = prev[prev.length - 1];
      const nextNum = last ? last.unit_number + 1 : 1;
      const nextFrom = last ? last.page_to + 1 : 4;
      return [...prev, {
        unit_number: nextNum,
        unit_title: `Unit ${nextNum}`,
        page_from: nextFrom,
        page_to: nextFrom + 7,
        selected: true,
        status: 'idle',
        vocabCount: 0,
        patternCount: 0,
        extraCount: 0,
        extractedData: null
      }];
    });
  };

  // 📸 步骤一：极速逐课切片并生成原图预览 (不调 LLM，纯本地渲染 + R2 存储)
  const handleSliceOutlineUnits = async (specificUnitIdx = null) => {
    if (!pdfDoc) return;
    setSlicingUnits(true);

    const indices = specificUnitIdx !== null
      ? [specificUnitIdx]
      : outline.map((u, i) => (u.selected ? i : -1)).filter(i => i !== -1);

    if (indices.length === 0) {
      alert('请至少勾选一个需要切片的单元');
      setSlicingUnits(false);
      return;
    }

    setStatusMsg('📸 正在极速逐课切片原图并生成预览...');

    try {
      for (const idx of indices) {
        const item = outline[idx];
        setCurrentProcessingUnit(item.unit_number);
        updateOutlineItem(idx, 'status', 'slicing');

        const pdfStart = item.page_from + pageOffset;
        const pdfEnd = item.page_to + pageOffset;

        if (pdfStart > totalPages) {
          updateOutlineItem(idx, 'status', 'error');
          continue;
        }

        const realPdfEnd = Math.min(pdfEnd, totalPages);
        setStatusMsg(`📸 正在切片 U${item.unit_number} (${item.unit_title}): 课本第 ${item.page_from}-${item.page_to} 页 (PDF 第 ${pdfStart}-${realPdfEnd} 页)...`);

        const thumbs = [];
        const fd = new FormData();

        for (let p = pdfStart; p <= realPdfEnd; p++) {
          const bookPageNum = p - pageOffset;
          const page = await pdfDoc.getPage(p);

          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
          thumbs.push({ url: URL.createObjectURL(blob), pageNum: bookPageNum, pdfPage: p });
          fd.append('images', blob, `page-${String(bookPageNum).padStart(2, '0')}.jpg`);
        }

        // 上传到 R2 (不调 LLM，纯存储切图)
        try {
          await fetch(`${API_BASE_URL}/textbooks/upload-unit-slices/${bookCode}/${item.unit_number}`, {
            method: 'POST',
            headers: { 'X-API-Key': API_KEY },
            body: fd
          });
        } catch (ue) {
          console.warn('Upload slices to R2 failed:', ue);
        }

        setOutline(prev => {
          const list = [...prev];
          list[idx] = {
            ...list[idx],
            status: 'sliced',
            sliceThumbs: thumbs
          };
          return list;
        });
      }

      setStatusMsg('🎉 批量切片已完成！您可以直接点击【💾 保存切片大纲】存入系统，或继续点击【🤖 步骤二：批量 AI 知识点提取】');
    } catch (e) {
      alert('切片过程出错: ' + e.message);
    } finally {
      setSlicingUnits(false);
      setCurrentProcessingUnit(null);
    }
  };

  // 🤖 步骤二：调用 AI 视觉模型提取词汇、句型与知识点 (可批量，也可单课)
  const handleStartAiExtraction = async (specificUnitIdx = null) => {
    if (!pdfDoc) return;
    setExtractingAi(true);

    const indices = specificUnitIdx !== null
      ? [specificUnitIdx]
      : outline.map((u, i) => (u.selected && u.status !== 'success' ? i : -1)).filter(i => i !== -1);

    if (indices.length === 0) {
      alert('所有选中的课时已提取完毕，或未勾选课时');
      setExtractingAi(false);
      return;
    }

    setStatusMsg('🤖 正在调用 AI 视觉大模型批量提取课本知识点...');

    try {
      for (const idx of indices) {
        const item = outline[idx];
        setCurrentProcessingUnit(item.unit_number);
        updateOutlineItem(idx, 'status', 'extracting');
        setStatusMsg(`🤖 AI 正在识别 U${item.unit_number} (${item.unit_title})...`);

        const pdfStart = item.page_from + pageOffset;
        const pdfEnd = Math.min(item.page_to + pageOffset, totalPages);

        const fd = new FormData();
        let unitTextContent = '';

        // 提取文本层
        for (let p = pdfStart; p <= pdfEnd; p++) {
          try {
            const page = await pdfDoc.getPage(p);
            const textObj = await page.getTextContent();
            const pageStr = textObj.items.map(it => it.str).filter(Boolean).join(' ');
            if (pageStr.trim()) unitTextContent += `\n[Page ${p - pageOffset}]: ${pageStr}`;
          } catch (te) {}
        }
        if (unitTextContent.trim()) {
          fd.append('unit_text', unitTextContent.trim());
        }

        // 如果本地已存在 sliceThumbs，直接拼合全景图给 AI
        let thumbs = item.sliceThumbs;
        if (!thumbs || thumbs.length === 0) {
          // 现场快速切图
          thumbs = [];
          for (let p = pdfStart; p <= pdfEnd; p++) {
            const page = await pdfDoc.getPage(p);
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));
            thumbs.push({ url: URL.createObjectURL(blob), pageNum: p - pageOffset, pdfPage: p });
          }
        }

        if (thumbs.length > 0) {
          const loadedImgs = await Promise.all(thumbs.map(t => new Promise(res => {
            const img = new Image();
            img.onload = () => res(img);
            img.src = t.url;
          })));

          const cols = loadedImgs.length <= 2 ? loadedImgs.length : (loadedImgs.length <= 4 ? 2 : 4);
          const rows = Math.ceil(loadedImgs.length / cols);
          const singleW = 800;
          const singleH = (loadedImgs[0].naturalHeight / loadedImgs[0].naturalWidth) * singleW;

          const collageCanvas = document.createElement('canvas');
          collageCanvas.width = singleW * cols;
          collageCanvas.height = singleH * rows;
          const cCtx = collageCanvas.getContext('2d');
          cCtx.fillStyle = '#ffffff';
          cCtx.fillRect(0, 0, collageCanvas.width, collageCanvas.height);

          loadedImgs.forEach((img, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            cCtx.drawImage(img, col * singleW, row * singleH, singleW, singleH);
          });

          const collageBlob = await new Promise(res => collageCanvas.toBlob(res, 'image/jpeg', 0.85));
          fd.append('ai_vision', collageBlob, 'ai_vision.jpg');
        }

        if (bookSchema) fd.append('content_schema', JSON.stringify(bookSchema));
        if (llmConfig?.baseUrl) fd.append('llm_base_url', llmConfig.baseUrl);
        if (llmConfig?.apiKey) fd.append('llm_api_key', llmConfig.apiKey);
        if (llmConfig?.model) fd.append('llm_model', llmConfig.model);

        const reqHeaders = { 'X-API-Key': API_KEY };
        if (llmConfig?.baseUrl) reqHeaders['X-LLM-Base-Url'] = llmConfig.baseUrl;
        if (llmConfig?.apiKey) reqHeaders['X-LLM-Api-Key'] = llmConfig.apiKey;
        if (llmConfig?.model) reqHeaders['X-LLM-Model'] = llmConfig.model;

        const res = await fetch(`${API_BASE_URL}/textbooks/preview-unit/${bookCode}/${item.unit_number}`, {
          method: 'POST',
          headers: reqHeaders,
          body: fd
        });
        const json = await res.json();

        if (json.data) {
          const d = json.data;
          const extraTotal = Object.values(d.extra_content || {}).reduce((acc, v) => acc + (Array.isArray(v) ? v.length : 0), 0);

          setOutline(prev => {
            const list = [...prev];
            list[idx] = {
              ...list[idx],
              status: 'success',
              vocabCount: (d.vocab || []).length,
              patternCount: (d.patterns || []).length,
              extraCount: extraTotal,
              extractedData: {
                unit_number: item.unit_number,
                unit_title: d.unit_title || item.unit_title,
                page_from: item.page_from,
                page_to: item.page_to,
                vocab: d.vocab || [],
                patterns: d.patterns || [],
                grammar: d.grammar || [],
                extra_content: d.extra_content || {}
              }
            };
            return list;
          });
        } else {
          const errMsg = json.error?.message || '提取失败';
          setOutline(prev => {
            const list = [...prev];
            list[idx] = { ...list[idx], status: 'error', errorMsg: errMsg };
            return list;
          });
          setStatusMsg(`⚠️ Unit ${item.unit_number} 提取失败: ${errMsg}`);
        }
      }

      setStatusMsg('🎉 AI 提取完毕！请核对各单元数据并点击下方【全部保存入库】');
    } catch (err) {
      alert('AI 提取出错: ' + err.message);
    } finally {
      setExtractingAi(false);
      setCurrentProcessingUnit(null);
    }
  };

  // 一键两步走 (切片 + AI 提取)
  const handleStartOutlineExtraction = async () => {
    await handleSliceOutlineUnits();
    await handleStartAiExtraction();
  };

  // 全部保存入库
  // 全部保存入库 (支持纯切片大纲入库，也支持带AI知识点的全量入库)
  const handleCommitAll = async () => {
    const readyUnits = outline
      .filter(u => u.selected && (u.status === 'success' || u.status === 'sliced' || (u.sliceThumbs && u.sliceThumbs.length > 0) || u.extractedData))
      .map(u => {
        if (u.extractedData) {
          return {
            ...u.extractedData,
            unit_title: u.unit_title || u.extractedData.unit_title,
            unit_number: u.unit_number
          };
        }
        return {
          unit_number: u.unit_number,
          unit_title: u.unit_title || `Lesson ${u.unit_number}`,
          page_from: u.page_from,
          page_to: u.page_to,
          vocab: [],
          patterns: [],
          grammar: [],
          extra_content: { page_count: u.sliceThumbs?.length || (u.page_to - u.page_from + 1) }
        };
      });

    if (readyUnits.length === 0) {
      alert('请先勾选并完成【📸 步骤一：极速批量切片】后再保存入库');
      return;
    }

    setSavingAll(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/textbooks/commit-units/${bookCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ units: readyUnits })
      });
      const text = await resp.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (pe) {
        alert('保存失败: 服务器响应异常 (' + text.substring(0, 100) + ')');
        setSavingAll(false);
        return;
      }
      if (json.data) {
        const hasAi = readyUnits.some(u => (u.vocab && u.vocab.length > 0) || (u.patterns && u.patterns.length > 0));
        alert(`🎉 恭喜！已将 ${json.data.units_written} 个课时的大纲与切片原图全部保存入库！${hasAi ? '（含已提取的 AI 知识点）' : '（后续可在课时列表中随时点击【⚡ 提取此课】生成知识点）'}`);
        onClose();
      } else {
        alert('保存失败: ' + (json.error?.message || '未知错误'));
      }
    } catch (e) {
      alert('保存出错: ' + e.message);
    }
    setSavingAll(false);
  };

  const successCount = outline.filter(u => u.status === 'success').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-5xl shadow-2xl border-0 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <CardHeader className="bg-white border-b border-gray-100 flex items-center justify-between py-4 px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center text-primary-700 font-bold shadow-inner border border-primary-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                整本 PDF 批量导入 — {bookName} ({bookCode})
              </h2>
              <p className="text-xs text-gray-500 mt-1 font-medium">AI 关键词识别 · 智能自动分页 · 批量知识点提取</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="w-8 h-8 p-0 rounded-full bg-gray-50 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </Button>
        </CardHeader>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50/50">
          {/* 1. 上传整本 PDF */}
          {!pdfDoc ? (
            <div className="border-2 border-dashed border-primary-200 rounded-2xl p-12 text-center bg-white hover:border-primary-400 hover:bg-primary-50/50 transition-all cursor-pointer">
              <Upload className="w-12 h-12 text-primary-300 mx-auto mb-4" />
              <div className="text-lg font-bold text-gray-900 mb-2">选择《{bookName}》原版整本 PDF 文件</div>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">系统将自动扫描 Unit/Lesson 关键词推导课本起止页码，免去手动算页码的繁琐步骤！</p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 cursor-pointer shadow-md hover:shadow-lg transition-all">
                <FileText className="w-4 h-4" />
                <span>浏览本地整本 PDF</span>
                <input type="file" accept="application/pdf" onChange={handleSelectBookPdf} className="hidden" />
              </label>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 2. 核心：页码偏移量校准器 (Offset) */}
              <div className="p-5 bg-white border border-gray-200 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm">
                <div className="space-y-2 flex-1">
                  <div className="text-sm font-bold text-gray-900 flex items-center gap-3">
                    <span className="flex items-center gap-2"><Layers className="w-5 h-5 text-primary-500" /> 页码偏移量校准</span>
                    <Badge variant="primary" className="text-xs">当前偏移: +{pageOffset}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
                    计算公式：<b>PDF 真实页码 = 课本印刷页码 + {pageOffset}</b><br/>
                    示例：课本印刷第 2 页，在 PDF 中位于第 {2 + pageOffset} 页
                  </p>
                </div>

                {/* 调节按钮与微调器 */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 overflow-hidden shadow-inner">
                    <button
                      type="button"
                      onClick={() => handleOffsetChange(pageOffset - 1)}
                      className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 font-bold border-r border-gray-200 transition-colors"
                    >
                      -1
                    </button>
                    <span className="px-5 py-2 text-sm font-bold text-primary-700 bg-white min-w-[3rem] text-center">+{pageOffset}</span>
                    <button
                      type="button"
                      onClick={() => handleOffsetChange(pageOffset + 1)}
                      className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 font-bold border-l border-gray-200 transition-colors"
                    >
                      +1
                    </button>
                  </div>

                  {/* 缩略图肉眼核对 */}
                  {previewThumbnail && (
                    <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-200 shrink-0">
                      <img src={previewThumbnail} alt="Preview" className="h-16 w-auto object-contain rounded border border-gray-200 shadow-sm bg-white" />
                      <div className="text-xs text-gray-600 text-left">
                        <div className="font-medium mb-1">PDF 第 <b>{previewingPdfPage}</b> 页</div>
                        <div className="text-success-600 font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> 采样核对</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. 单元目录大纲表格与智能探测工具栏 */}
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
                {/* 智能扫描与识别栏 */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gradient-to-r from-primary-50/60 to-blue-50/40 border border-primary-100 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-primary-600" />
                      智能目录探测与分页
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-white text-primary-700 border-primary-200">
                      已划分 {outline.length} 单元/课时
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => scanKeywordsAndPaginate(pdfDoc)}
                      disabled={detectingToc || processing || loadingPdf}
                      className="h-8 text-xs bg-white border-primary-200 text-primary-700 hover:bg-primary-50"
                      title="扫描 PDF 文本层中的 Unit/Lesson/Story/Review 关键词并智能划分起止页"
                    >
                      {detectingToc ? <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                      ⚡ 重新扫描关键词分页
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTocPicker(!showTocPicker)}
                      disabled={detectingToc || processing || loadingPdf}
                      className={`h-8 text-xs font-bold transition-colors ${
                        showTocPicker ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
                      }`}
                      title="自定义指定课本目录所在页码并让 AI 视觉识别"
                    >
                      {detectingToc ? <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5 text-blue-500" />}
                      🤖 AI 视觉扫描目录 {showTocPicker ? '▲' : '▼'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setShowRuleGenerator(!showRuleGenerator)}
                      disabled={processing || loadingPdf}
                      className={`h-8 text-xs font-bold transition-colors ${
                        showRuleGenerator ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-50'
                      }`}
                      title="适用于无目录或固定课时的教材，一键生成 Lesson 1 ~ N 的标准起止页大纲"
                    >
                      <Layers className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                      📐 规律排课生成 {showRuleGenerator ? '▲' : '▼'}
                    </Button>
                  </div>
                </div>

                {/* AI 目录视觉扫描设置抽屉 */}
                {showTocPicker && (
                  <div className="p-4 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        AI 视觉扫描目录配置（请指定课本目录页在 PDF 中的真实页码）
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowTocPicker(false)}
                        className="text-blue-700 hover:text-blue-950 font-bold text-xs"
                      >
                        ✕ 关闭
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-700">PDF 目录所在页：第</span>
                        <input
                          type="number"
                          min="1"
                          max={totalPages || 200}
                          value={tocStartPage}
                          onChange={e => {
                            const p = parseInt(e.target.value) || 1;
                            setTocStartPage(p);
                            if (pdfDoc) renderTocSample(pdfDoc, p);
                          }}
                          className="w-16 px-2.5 py-1 text-sm border-2 border-blue-300 rounded-lg font-bold text-center text-blue-800 bg-blue-50/30 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-500 font-bold">页 至 第</span>
                        <input
                          type="number"
                          min={tocStartPage}
                          max={totalPages || 200}
                          value={tocEndPage}
                          onChange={e => setTocEndPage(parseInt(e.target.value) || tocStartPage)}
                          className="w-16 px-2.5 py-1 text-sm border-2 border-blue-300 rounded-lg font-bold text-center text-blue-800 bg-blue-50/30 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-700 font-bold">页</span>
                      </div>

                      {/* 目录页实时缩略图 */}
                      {tocSampleThumb && (
                        <div className="flex items-center gap-2 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200">
                          <img src={tocSampleThumb} alt="TOC preview" className="h-10 w-auto object-contain rounded border border-gray-200 shadow-sm bg-white" />
                          <span className="text-[11px] text-gray-600 font-medium">第 {tocStartPage} 页采样确认</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          variant="primary"
                          size="sm"
                          type="button"
                          onClick={() => handleAiTocDetection(tocStartPage, tocEndPage)}
                          disabled={detectingToc || processing}
                          className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
                        >
                          {detectingToc ? <Loader className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                          {detectingToc ? '正在调用 AI 解析中...' : `🚀 确认扫描第 ${tocStartPage} - ${tocEndPage} 页并生成大纲`}
                        </Button>
                      </div>
                    </div>

                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      💡 <b>使用说明</b>：大部分教材前几页为封面、说明或版权页，目录通常在 <b>第 5~8 页</b>。调整页码时，中间的小缩略图会实时更新，当核对确认是目录页后，点击右侧蓝色按钮，AI 就会自动提取所有 Lesson/课时并切分好起止页码！
                    </p>
                  </div>
                )}

                {/* 快速规则生成大纲抽屉 */}
                {showRuleGenerator && (
                  <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-amber-600" />
                        快速规律排课生成器 (按固定页数与课时批量生成大纲)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRuleGenerator(false)}
                        className="text-amber-700 hover:text-amber-950 font-bold text-xs"
                      >
                        ✕ 关闭
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">课时前缀</label>
                        <select
                          value={ruleConfig.prefix}
                          onChange={e => setRuleConfig({ ...ruleConfig, prefix: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="Lesson">Lesson (课时)</option>
                          <option value="Unit">Unit (单元)</option>
                          <option value="Chapter">Chapter (章节)</option>
                          <option value="Story">Story (故事)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">课时总数</label>
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={ruleConfig.totalCount}
                          onChange={e => setRuleConfig({ ...ruleConfig, totalCount: parseInt(e.target.value) || 1 })}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">首课印刷起始页</label>
                        <input
                          type="number"
                          min="1"
                          value={ruleConfig.startPage}
                          onChange={e => setRuleConfig({ ...ruleConfig, startPage: parseInt(e.target.value) || 1 })}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">每课包含页数</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={ruleConfig.pagesPerLesson}
                          onChange={e => setRuleConfig({ ...ruleConfig, pagesPerLesson: parseInt(e.target.value) || 1 })}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <Button
                          variant="primary"
                          size="sm"
                          type="button"
                          onClick={handleGenerateOutlineByRule}
                          className="w-full h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold"
                        >
                          ⚡ 立即生成大纲
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleConfig.includeWelcome}
                          onChange={e => setRuleConfig({ ...ruleConfig, includeWelcome: e.target.checked })}
                          className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                        />
                        包含 Starter / Welcome 预备课
                      </label>
                      <span className="text-[11px] text-gray-400">（生成后可在下方列表中自由增删、修改标题或页码）</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-900">📖 单元精准切片大纲</span>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => {
                        const allSelected = outline.every(u => u.selected);
                        setOutline(prev => prev.map(u => ({ ...u, selected: !allSelected })));
                      }}
                      className="h-6 text-xs text-primary-600 hover:bg-primary-50"
                    >
                      {outline.every(u => u.selected) ? '取消全选' : '全选'}
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={addOutlineUnit} disabled={processing || slicingUnits || extractingAi || loadingPdf}>
                      <Plus className="w-4 h-4 mr-1" /> 添加单元
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSliceOutlineUnits(null)}
                      disabled={processing || slicingUnits || extractingAi || loadingPdf}
                      className="bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 font-bold shadow-sm"
                      title="仅从 PDF 极速切出页面并生成原图预览，不调用大模型，几秒钟即可完成并核对切图！"
                    >
                      {slicingUnits ? <Loader className="w-4 h-4 mr-1.5 animate-spin" /> : <Camera className="w-4 h-4 mr-1.5 text-amber-600" />}
                      {slicingUnits ? '切片处理中...' : '📸 步骤一：极速批量切片'}
                    </Button>

                    {/* 切片后可直接保存大纲与切图 */}
                    {outline.some(u => u.status === 'sliced' || u.status === 'success' || (u.sliceThumbs && u.sliceThumbs.length > 0)) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCommitAll}
                        disabled={savingAll || slicingUnits || extractingAi || loadingPdf}
                        className="bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-bold shadow-sm"
                        title="切片完成后可直接将课时大纲与切片原图存入系统，无需等待 AI 提取"
                      >
                        {savingAll ? <Loader className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5 text-emerald-600" />}
                        {savingAll ? '正在保存...' : '💾 保存切片大纲'}
                      </Button>
                    )}

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleStartAiExtraction(null)}
                      disabled={processing || slicingUnits || extractingAi || loadingPdf}
                      className="bg-primary-600 hover:bg-primary-700 text-white font-bold shadow-sm"
                      title="核对切片原图无误后，调用 AI 视觉大模型批量提取知识点"
                    >
                      {extractingAi ? <Loader className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                      {extractingAi ? 'AI 正在批量识别...' : '🤖 步骤二：批量 AI 知识点提取'}
                    </Button>
                  </div>
                </div>

                {/* 常用教材一键快速排课 */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
                  <span className="font-bold text-gray-700 shrink-0">📚 一键载入标准大纲预设:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const p = DEFAULT_OUTLINES['WE-P'];
                      setOutline(p.map(u => ({ ...u, selected: true, status: 'idle', vocabCount: 0, patternCount: 0, extraCount: 0, extractedData: null })));
                      setPageOffset(0);
                      if (pdfDoc) renderOffsetSample(pdfDoc, p[1].page_from);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-primary-50 text-primary-700 border border-gray-200 rounded-lg font-medium transition-colors shadow-sm"
                  >
                    Phonics 1 (单字母 Aa-Zz)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = DEFAULT_OUTLINES['WE_P3'];
                      setOutline(p.map(u => ({ ...u, selected: true, status: 'idle', vocabCount: 0, patternCount: 0, extraCount: 0, extractedData: null })));
                      setPageOffset(0);
                      if (pdfDoc) renderOffsetSample(pdfDoc, p[0].page_from);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-lg font-bold transition-colors shadow-sm"
                  >
                    Phonics 3 (辅音连缀 bl·cl·fl)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = DEFAULT_OUTLINES['DEFAULT'];
                      setOutline(p.map(u => ({ ...u, selected: true, status: 'idle', vocabCount: 0, patternCount: 0, extraCount: 0, extractedData: null })));
                      setPageOffset(2);
                      if (pdfDoc) renderOffsetSample(pdfDoc, p[1].page_from + 2);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg font-medium transition-colors shadow-sm"
                  >
                    Everybody Up (8单元)
                  </button>
                </div>

                {statusMsg && (
                  <div className="text-sm text-primary-800 bg-primary-50 border border-primary-100 p-3 rounded-xl font-medium flex items-center gap-2">
                    {(processing || slicingUnits || extractingAi || detectingToc) && <Loader className="w-4 h-4 animate-spin shrink-0" />}
                    {statusMsg}
                  </div>
                )}

                {/* 大纲表格 */}
                <div className="border border-gray-200 rounded-xl overflow-x-auto bg-white shadow-sm">
                  <table className="w-full text-sm text-left min-w-[860px]">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold text-xs">
                      <tr>
                        <th className="px-3 py-3 w-10 text-center">选</th>
                        <th className="px-3 py-3 w-14 text-center">课时</th>
                        <th className="px-3 py-3 min-w-[220px]">单元/课时标题</th>
                        <th className="px-3 py-3 w-36 text-center">印刷页码</th>
                        <th className="px-3 py-3 w-28 text-center">对应 PDF</th>
                        <th className="px-3 py-3 w-36 text-center">📸 切片原图</th>
                        <th className="px-3 py-3 min-w-[200px] text-center">🤖 知识点提取结果</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(() => {
                        const isLessonMode = isPhonics || outline.some(it => (it.unit_title || '').toLowerCase().includes('lesson'));
                        return outline.map((u, idx) => {
                          const pdfFrom = u.page_from + pageOffset;
                          const pdfTo = u.page_to + pageOffset;
                          const pageCount = Math.max(1, u.page_to - u.page_from + 1);
                          const isProcessingThis = currentProcessingUnit === u.unit_number;

                          return (
                            <tr key={idx} className={`${isProcessingThis ? 'bg-primary-50/50' : 'hover:bg-gray-50'} transition-colors`}>
                              <td className="px-3 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={u.selected}
                                  onChange={e => updateOutlineItem(idx, 'selected', e.target.checked)}
                                  className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2.5 font-bold text-gray-900 text-center">
                                {u.unit_number === 0 ? 'Intro' : isLessonMode ? `L${u.unit_number}` : `U${u.unit_number}`}
                              </td>
                              <td className="px-3 py-2.5">
                                <input
                                  type="text"
                                  value={u.unit_title}
                                  onChange={e => updateOutlineItem(idx, 'unit_title', e.target.value)}
                                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none transition-shadow"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center justify-center gap-1.5">
                                  <input
                                    type="number"
                                    value={u.page_from}
                                    onChange={e => updateOutlineItem(idx, 'page_from', parseInt(e.target.value) || 0)}
                                    className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                  />
                                  <span className="text-gray-400">-</span>
                                  <input
                                    type="number"
                                    value={u.page_to}
                                    onChange={e => updateOutlineItem(idx, 'page_to', parseInt(e.target.value) || 0)}
                                    className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                  />
                                  <span className="text-[11px] text-gray-400 font-mono">({pageCount}P)</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 font-bold text-center bg-gray-50/50 whitespace-nowrap text-xs">
                                第 {pdfFrom} - {pdfTo} 页
                              </td>

                              {/* 📸 切片原图 */}
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                {u.status === 'slicing' ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium animate-pulse whitespace-nowrap">
                                    📸 切片中...
                                  </span>
                                ) : u.sliceThumbs && u.sliceThumbs.length > 0 ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPreviewSliceModal({
                                      title: `${u.unit_title} (印刷第 ${u.page_from}-${u.page_to} 页 / PDF 第 ${pdfFrom}-${pdfTo} 页)`,
                                      thumbs: u.sliceThumbs
                                    })}
                                    className="h-7 px-3 text-xs bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg font-bold shadow-sm whitespace-nowrap inline-flex items-center gap-1"
                                    title="点击放大查看该课切出的所有高清原图"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                                    <span>预览原图 ({u.sliceThumbs.length}P)</span>
                                  </Button>
                                ) : (
                                  <span className="text-gray-300 text-xs font-medium">待切片</span>
                                )}
                              </td>

                              {/* 🤖 知识点提取结果 */}
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                {u.status === 'extracting' ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 text-xs font-medium animate-pulse whitespace-nowrap">
                                    🤖 AI 识别中...
                                  </span>
                                ) : u.status === 'success' ? (
                                  <div className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-lg font-medium shadow-sm whitespace-nowrap">
                                    <span className="font-bold">{u.vocabCount} 词</span>
                                    <span className="text-emerald-300">·</span>
                                    <span className="font-bold">{u.patternCount} 句</span>
                                    {u.extraCount > 0 && (
                                      <>
                                        <span className="text-emerald-300">·</span>
                                        <span className="text-primary-700 font-bold">✨{u.extraCount} 拓展</span>
                                      </>
                                    )}
                                  </div>
                                ) : u.status === 'error' ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-danger-50 text-danger-700 border border-danger-200 text-xs font-bold whitespace-nowrap" title={u.errorMsg}>
                                      失败
                                    </span>
                                    <Button
                                      variant="ghost" size="sm"
                                      onClick={() => handleStartAiExtraction(idx)}
                                      disabled={slicingUnits || extractingAi}
                                      className="h-6 px-2 text-[11px] text-danger-700 hover:bg-danger-50 font-bold rounded-md"
                                    >
                                      重试
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStartAiExtraction(idx)}
                                    disabled={slicingUnits || extractingAi}
                                    className="h-7 px-2.5 text-xs text-primary-700 hover:bg-primary-50 font-bold border border-primary-200 hover:border-primary-300 bg-white rounded-lg shadow-sm whitespace-nowrap inline-flex items-center"
                                    title="单独调用 AI 识别此课时"
                                  >
                                    ⚡ 提取此课
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 切片原图查看弹窗 */}
        {previewSliceModal && (
          <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-gray-200">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-gray-900 text-sm">{previewSliceModal.title}</span>
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-200">
                    共 {previewSliceModal.thumbs.length} 页切图
                  </Badge>
                </div>
                <button
                  onClick={() => setPreviewSliceModal(null)}
                  className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-100/60 flex-1">
                {previewSliceModal.thumbs.map((t, i) => (
                  <div key={i} className="bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center">
                    <div className="w-full aspect-[3/4] bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center border border-gray-100 mb-2">
                      <img src={t.url} alt={`Page ${t.pageNum}`} className="w-full h-full object-contain" />
                    </div>
                    <div className="text-xs font-bold text-gray-800 flex items-center justify-between w-full px-1">
                      <span>课本第 {t.pageNum} 页</span>
                      <span className="text-gray-400 font-normal">PDF P{t.pdfPage}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-white border-t border-gray-100 flex justify-end">
                <Button variant="primary" size="sm" onClick={() => setPreviewSliceModal(null)}>
                  确认切片无误，关闭预览
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-between shrink-0">
          <Button variant="outline" onClick={onClose}>
            关闭窗口
          </Button>

          {outline.some(u => u.selected && (u.status === 'sliced' || u.status === 'success' || (u.sliceThumbs && u.sliceThumbs.length > 0) || u.extractedData)) && (
            <Button
              variant="success"
              onClick={handleCommitAll}
              disabled={savingAll || slicingUnits || extractingAi}
              className="px-6 shadow-md font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
            >
              {savingAll ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />}
              {savingAll ? '正在保存入库...' : `💾 保存已选大纲与切片 (${outline.filter(u => u.selected && (u.status === 'sliced' || u.status === 'success' || (u.sliceThumbs && u.sliceThumbs.length > 0) || u.extractedData)).length} 课时)`}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

// 教材库管理子组件
function BooksManageModal({ books, onClose }) {
  const [list, setList] = useState(books || []);
  const [editingCode, setEditingCode] = useState(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    series: '',
    structure_type: 'unit',
    level: 'A1',
    publisher: 'Oxford',
    total_units: 8,
    description: '',
    schema_type: 'general_english',
    target_age: ''
  });

  // 提取现有系列列表
  const existingSeries = Array.from(new Set(list.map(b => b.series).filter(Boolean)));

  const handleSaveBook = async (e) => {
    e.preventDefault();
    if (!form.code || !form.name) return alert('Code 和名称必填');

    try {
      const schemaObj = {
        type: form.schema_type || 'general_english',
        target_age: form.target_age || (form.schema_type === 'phonics' ? '4-8' : '5-12')
      };
      const payload = {
        ...form,
        content_schema: schemaObj
      };

      if (editingCode) {
        await request(`/textbooks/books-manage/${editingCode}`, { method: 'PATCH', body: payload });
      } else {
        await request('/textbooks/books-manage', { method: 'POST', body: payload });
      }
      const resp = await request('/textbooks');
      setList(resp.data || []);
      setEditingCode(null);
      setForm({ code: '', name: '', series: '', structure_type: 'unit', level: 'A1', publisher: 'Oxford', total_units: 8, description: '', schema_type: 'general_english', target_age: '' });
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  };

  const handleDeleteBook = async (code) => {
    if (!confirm(`确定删除教材 ${code} 及其所有单元内容吗？`)) return;
    try {
      await request(`/textbooks/books-manage/${code}`, { method: 'DELETE' });
      const resp = await request('/textbooks');
      setList(resp.data || []);
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-2xl border-0 overflow-hidden flex flex-col max-h-[85vh]">
        <CardHeader className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary-600" />
            教材系列与目录管理
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="w-8 h-8 p-0 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </Button>
        </CardHeader>

        <div className="p-6 overflow-y-auto space-y-6 bg-gray-50/50">
          <form onSubmit={handleSaveBook} className="p-5 bg-white border border-gray-200 rounded-xl space-y-4 shadow-sm">
            <div className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
              {editingCode ? `编辑教材: ${editingCode}` : '➕ 新增教材 / 系列'}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">所属教材系列 (Series - 一级分类)</label>
                <input
                  type="text"
                  list="series-options"
                  value={form.series}
                  onChange={e => setForm({ ...form, series: e.target.value })}
                  placeholder="如 Everybody Up / Oxford Phonics..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
                <datalist id="series-options">
                  {existingSeries.map(s => <option key={s} value={s} />)}
                  <option value="Everybody Up" />
                  <option value="Oxford Phonics World" />
                  <option value="自然拼读 (Phonics)" />
                  <option value="Wonders" />
                  <option value="Reach Higher" />
                  <option value="剑桥少儿英语" />
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">教材代码 (Code)</label>
                <input
                  type="text"
                  disabled={!!editingCode}
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  placeholder="如 EU-L4 / WE-P / OPW-1"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">教材全称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="如 Phonics 1 / Everybody Up 4"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">目录结构类型 (Structure Type)</label>
                <select
                  value={form.structure_type || 'unit'}
                  onChange={e => setForm({ ...form, structure_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-medium text-gray-800"
                >
                  <option value="unit">按 Unit 单元 (如 Unit 1 ~ 8，适合综合课本)</option>
                  <option value="lesson">按 Lesson 课时 (如 Lesson 1 ~ 16，适合拼读/专项)</option>
                  <option value="chapter">按 Chapter 章节 (如 Chapter 1 ~ 10，适合阅读)</option>
                  <option value="story">按 Story 故事/绘本 (适合绘本分级)</option>
                </select>
              </div>
            </div>

            {/* AI 提取方案与体系配置 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">AI 提取方案 / 教材体系</label>
                <select
                  value={form.schema_type || 'general_english'}
                  onChange={e => {
                    const t = e.target.value;
                    const struct = t === 'phonics' ? 'lesson' : (t === 'graded_reader' ? 'story' : form.structure_type);
                    setForm({ ...form, schema_type: t, structure_type: struct });
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none font-medium text-gray-800"
                >
                  <option value="general_english">📖 综合英语 (词汇、日常交际句型、语法焦点)</option>
                  <option value="phonics">🔤 自然拼读 (字母音素、拼读生词、视读词)</option>
                  <option value="graded_reader">📚 分级阅读 / 绘本 (核心词句、故事理解、问答)</option>
                  <option value="grammar">📝 专项语法 (语法规则公式、典型例句、练习)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">目标年龄 / 年级描述</label>
                <input
                  type="text"
                  value={form.target_age || ''}
                  onChange={e => setForm({ ...form, target_age: e.target.value })}
                  placeholder={form.schema_type === 'phonics' ? '4-8 岁' : '5-12 岁'}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">CEFR 等级</label>
                <select
                  value={form.level}
                  onChange={e => setForm({ ...form, level: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="Pre-A1">Pre-A1</option>
                  <option value="A1">A1</option>
                  <option value="A1+">A1+</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">总单元/课时数</label>
                <input
                  type="number"
                  value={form.total_units}
                  onChange={e => setForm({ ...form, total_units: parseInt(e.target.value) || 8 })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {editingCode && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => {
                    setEditingCode(null);
                    setForm({ code: '', name: '', series: '', level: 'A1', publisher: 'Oxford', total_units: 8, description: '', schema_type: 'general_english', target_age: '' });
                  }}
                >
                  取消
                </Button>
              )}
              <Button type="submit" size="sm">
                {editingCode ? '更新配置' : '确认添加'}
              </Button>
            </div>
          </form>

          <div className="space-y-3">
            <div className="text-sm font-bold text-gray-900 px-1">现有教材列表 ({list.length})</div>
            <div className="grid gap-2">
              {list.map(b => (
                <div key={b.code} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-shadow group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center text-primary-600">
                      <Book className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900 text-sm">{b.name}</span>
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] bg-gray-100 uppercase">{b.level}</Badge>
                        {b.series && <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-primary-200 text-primary-700 bg-primary-50/50">{b.series}</Badge>}
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-blue-200 text-blue-700 bg-blue-50/60">
                          {b.content_schema?.type === 'phonics' ? '🔤 自然拼读' : (b.content_schema?.type === 'graded_reader' ? '📚 分级阅读' : (b.content_schema?.type === 'grammar' ? '📝 语法课本' : '📖 综合英语'))}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 font-mono">{b.code} · 共 {b.total_units || 8} 单元</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingCode(b.code);
                        setForm({
                          code: b.code,
                          name: b.name,
                          series: b.series || '',
                          structure_type: b.structure_type || 'unit',
                          level: b.level || 'A1',
                          publisher: b.publisher || 'Oxford',
                          total_units: b.total_units || 8,
                          description: b.description || '',
                          schema_type: b.content_schema?.type || (b.name?.toLowerCase().includes('phonics') ? 'phonics' : 'general_english'),
                          target_age: b.content_schema?.target_age || ''
                        });
                      }}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBook(b.code)}
                      className="p-2 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// ⚙️ AI 视觉大模型设置 Modal (支持常用预设与连通性测试)
// ============================================================
const LLM_PRESETS = [
  {
    id: 'nvidia_11b',
    name: 'NVIDIA Llama-3.2-11B Vision (首选极速推荐 · ~500ms)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.2-11b-vision-instruct',
    desc: 'NVIDIA NIM 官方高吞吐模型，约 0.5 秒极速响应，英文课本 OCR 与版式识别极准'
  },
  {
    id: 'nvidia_90b',
    name: 'NVIDIA Llama-3.2-90B Vision (900亿旗舰版)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.2-90b-vision-instruct',
    desc: '900亿参数超大视觉模型（若遇官方队列高峰，系统会自动切换到 11B 备选）'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM-4V',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4v-flash',
    desc: 'glm-4v-flash 免费提供无需充值，中文释义地道'
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o)',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    desc: '业界顶级视觉多模态 (支持 gpt-4o / gpt-4o-mini)'
  },
  {
    id: 'qwen',
    name: '阿里通义千问 Qwen-VL',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-vl-plus',
    desc: '阿里云通义千问视觉大模型，识别速度快'
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    model: '',
    desc: '支持任何兼容 OpenAI 协议的自建或第三方中转服务'
  }
];

function LlmSettingsModal({ config, onSave, onClose }) {
  const [form, setForm] = useState({ ...config });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: bool, msg: string }

  // 切换预设
  const handleSelectPreset = (preset) => {
    if (preset.id === 'custom') {
      setForm(prev => ({ ...prev, provider: 'custom' }));
    } else {
      setForm(prev => ({
        ...prev,
        provider: preset.id,
        baseUrl: preset.baseUrl,
        model: preset.model
      }));
    }
    setTestResult(null);
  };

  // 测试连接性 (未填 Key 时自动使用服务端预置配置)
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const resp = await fetch(`${API_BASE_URL}/textbooks/test-llm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          base_url: form.baseUrl,
          api_key: form.apiKey || undefined,
          model: form.model
        })
      });
      const json = await resp.json();

      if (json.data?.success) {
        const keyInfo = form.apiKey ? '自定义 API Key' : '服务端预置 NVIDIA Key';
        setTestResult({
          success: true,
          msg: `✅ 连接成功！(使用: ${keyInfo})\n响应耗时: ${json.data.elapsed_ms}ms\n生效模型: ${json.data.model}\n模型回复: "${json.data.reply}"`
        });
      } else {
        setTestResult({
          success: false,
          msg: `❌ 测试失败: ${json.error?.message || '未知错误'}`
        });
      }
    } catch (e) {
      setTestResult({
        success: false,
        msg: `❌ 网络异常: ${e.message}`
      });
    }
    setTesting(false);
  };

  const handleSave = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    onSave(form);
    alert('✅ AI 视觉模型配置已保存并生效！');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl shadow-2xl border-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <CardHeader className="px-6 py-4 border-b border-indigo-100 bg-indigo-50/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">AI 视觉大模型配置中心</h2>
              <p className="text-xs text-gray-500 font-medium">自由切换 OpenAI、智谱、千问、NVIDIA NIM 或自定义接口</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="w-8 h-8 p-0 rounded-full bg-white hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </Button>
        </CardHeader>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
          {/* 预设平台快速切换 */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-gray-900">1. 选择模型服务商</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {LLM_PRESETS.map(p => {
                const isSelected = form.provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-500 shadow-md ring-2 ring-indigo-500/20 transform scale-[1.02]'
                        : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-sm'
                    }`}
                  >
                    <div>
                      <div className={`text-sm font-bold mb-1.5 ${isSelected ? 'text-indigo-900' : 'text-gray-800'}`}>
                        {p.name}
                      </div>
                      <div className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{p.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 详细参数配置 */}
          <div className="space-y-4 p-5 bg-gray-50 rounded-xl border border-gray-200 shadow-inner">
            <label className="block text-sm font-bold text-gray-900 mb-2">2. 配置模型接口参数</label>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                API Base URL (接口地址)
              </label>
              <input
                type="text"
                value={form.baseUrl || ''}
                onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="如 https://integrate.api.nvidia.com/v1"
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Model Name (模型名称)
              </label>
              <input
                type="text"
                value={form.model || ''}
                onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder="如 google/gemma-3n-e4b-it / glm-4v-flash / gpt-4o-mini"
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
                required
              />
            </div>

            <div>
              <label className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-700">API Key (密钥)</span>
                <Badge variant="secondary" className="text-[10px] bg-gray-200 text-gray-600 border-0">保存在本地浏览器中，调用时直接传输</Badge>
              </label>
              <input
                type="password"
                value={form.apiKey || ''}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
                placeholder="留空则自动使用服务端配置的 NVIDIA NIM Key (如需覆盖可输入 nvapi-...)"
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
              />
            </div>
          </div>

          {/* 连通性测试结果 */}
          {testResult && (
            <div className={`p-4 rounded-xl text-sm font-mono whitespace-pre-wrap border ${
              testResult.success ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-800'
            }`}>
              {testResult.msg}
            </div>
          )}
        </form>
        
        {/* Footer Buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <Button
            variant="outline"
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 bg-white"
          >
            {testing ? <Loader className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {testing ? '正在测试连接...' : '🧪 测试连接'}
          </Button>

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
              <Save className="w-4 h-4 mr-2" />
              保存配置并生效
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
