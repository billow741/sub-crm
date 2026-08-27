import { useState, useEffect, useRef } from 'react';
import { 
  Book, FileText, Upload, Sparkles, Loader, CheckCircle, XCircle, 
  Trash2, Plus, Edit3, Save, Eye, RefreshCw, AlertCircle, 
  ExternalLink, Layers, ChevronRight, Check, X, ArrowRight, Play, CheckCheck
} from 'lucide-react';
import { request, API_BASE_URL, API_KEY } from '../store/api';

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
  const [activeTab, setActiveTab] = useState('vocab'); // 'vocab' | 'patterns' | 'grammar'

  // 弹窗状态
  const [showBooksManage, setShowBooksManage] = useState(false);
  const [showBatchBookModal, setShowBatchBookModal] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState(null);

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

  // 切换选中单元
  const selectUnit = async (code, unitNum) => {
    setSelectedUnitNum(unitNum);
    setLoadingDetail(true);
    setRenderedImages([]);

    // 1. 获取单元内容
    try {
      const resp = await request(`/textbooks/content/${code}/${unitNum}`);
      if (resp.data) {
        setUnitDetail({
          unit_number: unitNum,
          unit_title: resp.data.unit_title || '',
          vocab: resp.data.vocab || [],
          patterns: resp.data.patterns || [],
          grammar: resp.data.grammar || []
        });
      } else {
        const u = bookUnits.find(item => item.unit_number === unitNum);
        setUnitDetail({
          unit_number: unitNum,
          unit_title: u?.unit_title || `Unit ${unitNum}`,
          vocab: [],
          patterns: [],
          grammar: []
        });
      }
    } catch (e) {
      const u = bookUnits.find(item => item.unit_number === unitNum);
      setUnitDetail({
        unit_number: unitNum,
        unit_title: u?.unit_title || `Unit ${unitNum}`,
        vocab: [],
        patterns: [],
        grammar: []
      });
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
      const maxPages = Math.min(numPages, 12);

      const images = [];
      for (let i = 1; i <= maxPages; i++) {
        setRenderProgress(`正在切片第 ${i} / ${maxPages} 页...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.85));
        images.push({ blob, url: URL.createObjectURL(blob), pageNum: i });
      }

      setRenderedImages(images);
      setRenderProgress('');
    } catch (err) {
      alert('PDF 切片失败: ' + err.message);
      setRenderProgress('');
    }
    setRendering(false);
    e.target.value = '';
  };

  // 触发单单元 AI 视觉多模态识别 (同时保存切图至 R2)
  const handleAiExtract = async () => {
    if (!selectedBookCode || selectedUnitNum === null) return;
    if (renderedImages.length === 0 && r2Pages.length === 0) {
      alert('请先上传该单元的 PDF 文件进行切片');
      return;
    }

    setExtracting(true);
    try {
      const fd = new FormData();
      if (renderedImages.length > 0) {
        renderedImages.forEach((img, i) => {
          fd.append('images', img.blob, `page-${String(i + 1).padStart(2, '0')}.png`);
        });
      } else {
        for (const p of r2Pages) {
          const res = await fetch(p.url, { headers: { 'X-API-Key': API_KEY } });
          const blob = await res.blob();
          fd.append('images', blob, `page-${String(p.page_num).padStart(2, '0')}.png`);
        }
      }

      const res = await fetch(`${API_BASE_URL}/textbooks/preview-unit/${selectedBookCode}/${selectedUnitNum}`, {
        method: 'POST',
        headers: { 'X-API-Key': API_KEY },
        body: fd
      });
      const json = await res.json();

      if (json.data) {
        const d = json.data;
        setUnitDetail(prev => ({
          ...prev,
          unit_title: d.unit_title || prev.unit_title,
          vocab: d.vocab || [],
          patterns: d.patterns || [],
          grammar: d.grammar || []
        }));
        loadUnitPages(selectedBookCode, selectedUnitNum);
        alert('🎉 AI 视觉识别完成！已自动为词汇和句型匹配标准中文翻译，请校对后点击【保存入库】');
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

  // 删除单张 R2 切图
  const handleDeletePageImg = async (pageNum) => {
    if (!confirm(`确定删除第 ${pageNum} 页切图吗？`)) return;
    try {
      await fetch(`${API_BASE_URL}/textbooks/page-img/${selectedBookCode}/${selectedUnitNum}/${pageNum}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': API_KEY }
      });
      loadUnitPages(selectedBookCode, selectedUnitNum);
    } catch (e) {
      alert('删除失败: ' + e.message);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px] text-gray-500 gap-2">
        <Loader className="w-5 h-5 animate-spin text-purple-600" />
        <span>正在加载教材工作台...</span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-50 overflow-hidden font-sans">
      {/* 顶部工具栏 */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 font-bold">
            <Book className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
              教材数字化工作台
              <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 font-medium rounded-full border border-purple-200">
                SaaS Workbench
              </span>
            </h1>
            <p className="text-xs text-gray-500">统一标准 R2 存储 · AI 视觉切片提取 · 双语对照闭环</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* 整本 PDF 批量导入按钮 */}
          <button
            type="button"
            onClick={() => setShowBatchBookModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>📖 整本 PDF 批量导入</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBooksManage(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition shadow-2xs cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-gray-500" />
            <span>教材管理</span>
          </button>
        </div>
      </div>

      {/* 三栏工作区主体 */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ================= 第一栏：教材目录列表 (260px) ================= */}
        <div className="w-64 bg-white border-r flex flex-col shrink-0">
          <div className="p-3 border-b bg-gray-50/70 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">教材系列 ({books.length})</span>
            <button
              onClick={() => setShowBooksManage(true)}
              className="text-purple-600 hover:text-purple-800 text-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> 添加
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {books.map(b => {
              const isSelected = b.code === selectedBookCode;
              return (
                <div
                  key={b.code}
                  onClick={() => selectBook(b.code)}
                  className={`p-3 rounded-xl cursor-pointer transition border text-left ${
                    isSelected
                      ? 'bg-purple-50/90 border-purple-300 shadow-xs ring-1 ring-purple-400/30'
                      : 'bg-white border-gray-200/80 hover:border-purple-200 hover:bg-gray-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-bold text-sm text-gray-900">{b.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                      {b.level || 'A1'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                    <span>{b.code}</span>
                    <span className="font-medium text-purple-600">{b.unit_count || 0} / {b.total_units} 单元</span>
                  </div>
                  {/* 进度条 */}
                  <div className="w-full bg-gray-100 h-1 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-purple-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.round(((b.unit_count || 0) / (b.total_units || 1)) * 100))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= 第二栏：单元大纲列表 (280px) ================= */}
        <div className="w-72 bg-white border-r flex flex-col shrink-0">
          <div className="p-3 border-b bg-gray-50/70 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              {selectedBook ? `${selectedBook.code} 单元列表` : '单元大纲'}
            </span>
            <span className="text-xs text-gray-500 font-medium">
              共 {bookUnits.length} 单元
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingUnits ? (
              <div className="py-8 text-center text-xs text-gray-400">正在加载单元...</div>
            ) : bookUnits.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">暂无单元数据</div>
            ) : (
              bookUnits.map(u => {
                const isSelected = u.unit_number === selectedUnitNum;
                const hasContent = u.has_content || u.content_count > 0;
                return (
                  <div
                    key={u.unit_number}
                    onClick={() => selectUnit(selectedBookCode, u.unit_number)}
                    className={`p-2.5 rounded-lg cursor-pointer transition flex items-center justify-between border ${
                      isSelected
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm font-medium'
                        : 'bg-white border-gray-150 text-gray-700 hover:bg-purple-50/50 hover:border-purple-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                      }`}>
                        U{u.unit_number}
                      </span>
                      <span className="text-xs truncate" title={u.unit_title || `Unit ${u.unit_number}`}>
                        {u.unit_title || `Unit ${u.unit_number}`}
                      </span>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {hasContent ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
                          isSelected ? 'bg-green-400/30 text-green-100' : 'bg-green-100 text-green-700'
                        }`}>
                          <CheckCircle className="w-2.5 h-2.5" /> 已录入
                        </span>
                      ) : (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          isSelected ? 'bg-white/20 text-white/80' : 'bg-gray-100 text-gray-400'
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
        <div className="flex-1 flex flex-col bg-gray-50/50 overflow-hidden">
          {selectedUnitNum === null || !unitDetail ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-2">
              <FileText className="w-12 h-12 text-gray-300 stroke-1" />
              <p className="text-sm">请在左侧选择需要编辑与提取的教材单元</p>
            </div>
          ) : (
            <>
              {/* 工作区 Header */}
              <div className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-900">
                    {selectedBookCode} · Unit {selectedUnitNum}
                  </span>
                  <input
                    type="text"
                    value={unitDetail.unit_title || ''}
                    onChange={(e) => setUnitDetail({ ...unitDetail, unit_title: e.target.value })}
                    placeholder="单元标题 (如: Art Class / Animals)"
                    className="px-2.5 py-1 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 w-48 font-medium"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAiExtract}
                    disabled={extracting || (renderedImages.length === 0 && r2Pages.length === 0)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-linear-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold rounded-lg hover:shadow-md transition disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {extracting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{extracting ? 'AI 识别中...' : '🤖 AI 视觉提取'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveUnitContent}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{saving ? '保存中...' : '💾 保存入库'}</span>
                  </button>
                </div>
              </div>

              {/* 工作区内容双栏分屏 (左切图预览，右词汇句型) */}
              <div className="flex-1 flex overflow-hidden p-4 gap-4">
                
                {/* 1. 左半屏：PDF 上传与 R2 切图管理 */}
                <div className="w-1/2 bg-white rounded-xl border border-gray-200/80 shadow-2xs flex flex-col overflow-hidden">
                  <div className="p-3 border-b bg-gray-50/70 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700">📄 课本原图切片</span>
                      <span className="text-[11px] text-gray-500 font-medium">
                        (R2 已存: {r2Pages.length} 页{renderedImages.length > 0 ? ` · 待上传: ${renderedImages.length} 页` : ''})
                      </span>
                    </div>

                    <label className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded border border-purple-200 hover:bg-purple-100 cursor-pointer transition">
                      <Upload className="w-3 h-3" />
                      <span>{rendering ? renderProgress : '上传 PDF 切片'}</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePdfUpload}
                        className="hidden"
                        disabled={rendering}
                      />
                    </label>
                  </div>

                  {/* 切图网格 */}
                  <div className="flex-1 overflow-y-auto p-4">
                    {loadingPages ? (
                      <div className="py-12 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                        <Loader className="w-4 h-4 animate-spin text-purple-600" />
                        <span>正在检索 R2 切图...</span>
                      </div>
                    ) : renderedImages.length > 0 ? (
                      <div>
                        <div className="text-xs font-bold text-purple-700 mb-2 flex items-center gap-1">
                          <span>✨ 本地新切片 ({renderedImages.length} 页) — 点击右上角 AI 识别即可一键入库:</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                          {renderedImages.map((img, i) => (
                            <div key={i} className="relative group border rounded-lg overflow-hidden bg-gray-100 shadow-2xs">
                              <img src={img.url} alt={`P${i + 1}`} className="w-full h-28 object-contain bg-white" />
                              <div className="text-[11px] text-center text-gray-600 bg-gray-50 py-0.5 border-t">
                                第 {i + 1} 页
                              </div>
                              <button
                                type="button"
                                onClick={() => setPreviewImageModal(img.url)}
                                className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs font-medium gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" /> 放大
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : r2Pages.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {r2Pages.map(p => (
                          <div key={p.page_num} className="relative group border rounded-lg overflow-hidden bg-gray-50 shadow-2xs">
                            <img src={p.url} alt={`Page ${p.page_num}`} className="w-full h-28 object-contain bg-white" />
                            <div className="text-[11px] text-center text-gray-600 bg-gray-50 py-0.5 border-t flex items-center justify-between px-1.5">
                              <span>P{p.page_num}</span>
                              <button
                                type="button"
                                onClick={() => handleDeletePageImg(p.page_num)}
                                className="text-red-400 hover:text-red-600"
                                title="删除此页"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPreviewImageModal(p.url)}
                              className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs font-medium gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> 放大
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-16 text-center text-gray-400 space-y-2">
                        <Upload className="w-8 h-8 text-gray-300 mx-auto" />
                        <p className="text-xs">该单元在 R2 空间暂无切图</p>
                        <p className="text-[11px] text-gray-400">点击右上角「上传 PDF 切片」自动切图并 AI 提取</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. 右半屏：结构化教学内容编辑 (Tabs) */}
                <div className="w-1/2 bg-white rounded-xl border border-gray-200/80 shadow-2xs flex flex-col overflow-hidden">
                  {/* Tabs */}
                  <div className="flex items-center justify-between border-b bg-gray-50/70 px-3 shrink-0">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setActiveTab('vocab')}
                        className={`px-3 py-2 text-xs font-bold border-b-2 transition ${
                          activeTab === 'vocab'
                            ? 'border-purple-600 text-purple-700'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        🔤 核心词汇 ({(unitDetail.vocab || []).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('patterns')}
                        className={`px-3 py-2 text-xs font-bold border-b-2 transition ${
                          activeTab === 'patterns'
                            ? 'border-purple-600 text-purple-700'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        💬 重点句型 ({(unitDetail.patterns || []).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('grammar')}
                        className={`px-3 py-2 text-xs font-bold border-b-2 transition ${
                          activeTab === 'grammar'
                            ? 'border-purple-600 text-purple-700'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        📐 语法焦点 ({(unitDetail.grammar || []).length})
                      </button>
                    </div>

                    <div>
                      {activeTab === 'vocab' && (
                        <button type="button" onClick={addVocabItem} className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-0.5">
                          <Plus className="w-3.5 h-3.5" /> 添加单词
                        </button>
                      )}
                      {activeTab === 'patterns' && (
                        <button type="button" onClick={addPatternItem} className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-0.5">
                          <Plus className="w-3.5 h-3.5" /> 添加句型
                        </button>
                      )}
                      {activeTab === 'grammar' && (
                        <button type="button" onClick={addGrammarItem} className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-0.5">
                          <Plus className="w-3.5 h-3.5" /> 添加语法
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tab 内容区 */}
                  <div className="flex-1 overflow-y-auto p-4">
                    {/* 词汇列表 */}
                    {activeTab === 'vocab' && (
                      <div className="space-y-2">
                        {(unitDetail.vocab || []).length === 0 ? (
                          <div className="py-12 text-center text-xs text-gray-400">暂无词汇数据，可点击「添加单词」或「AI 视觉提取」</div>
                        ) : (
                          (unitDetail.vocab || []).map((v, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 bg-gray-50/70 border border-gray-200/80 rounded-lg">
                              <button
                                type="button"
                                onClick={() => updateVocabItem(i, 'is_core', !v.is_core)}
                                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                  v.is_core ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-500'
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
                                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded bg-white font-medium"
                              />

                              <input
                                type="text"
                                value={v.translation || ''}
                                onChange={(e) => updateVocabItem(i, 'translation', e.target.value)}
                                placeholder="中文释义"
                                className="w-28 px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600"
                              />

                              <button
                                type="button"
                                onClick={() => removeVocabItem(i)}
                                className="text-gray-400 hover:text-red-600 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* 句型列表 */}
                    {activeTab === 'patterns' && (
                      <div className="space-y-2">
                        {(unitDetail.patterns || []).length === 0 ? (
                          <div className="py-12 text-center text-xs text-gray-400">暂无句型数据，可点击「添加句型」或「AI 视觉提取」</div>
                        ) : (
                          (unitDetail.patterns || []).map((p, i) => (
                            <div key={i} className="p-2.5 bg-gray-50/70 border border-gray-200/80 rounded-lg space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-gray-500">句型 {i + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => removePatternItem(i)}
                                  className="text-gray-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={p.pattern || ''}
                                onChange={(e) => updatePatternItem(i, 'pattern', e.target.value)}
                                placeholder="英文句型 (如: I have a pencil.)"
                                className="w-full px-2.5 py-1 text-xs border border-gray-300 rounded bg-white font-medium"
                              />
                              <input
                                type="text"
                                value={p.translation || ''}
                                onChange={(e) => updatePatternItem(i, 'translation', e.target.value)}
                                placeholder="中文翻译 (如: 我有一支铅笔。)"
                                className="w-full px-2.5 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* 语法列表 */}
                    {activeTab === 'grammar' && (
                      <div className="space-y-2">
                        {(unitDetail.grammar || []).length === 0 ? (
                          <div className="py-12 text-center text-xs text-gray-400">暂无语法数据，可点击「添加语法」或「AI 视觉提取」</div>
                        ) : (
                          (unitDetail.grammar || []).map((g, i) => (
                            <div key={i} className="p-2.5 bg-gray-50/70 border border-gray-200/80 rounded-lg space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-gray-500">语法点 {i + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => removeGrammarItem(i)}
                                  className="text-gray-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={g.point || ''}
                                onChange={(e) => updateGrammarItem(i, 'point', e.target.value)}
                                placeholder="语法要点 (如: Simple Present / Countable Nouns)"
                                className="w-full px-2.5 py-1 text-xs border border-gray-300 rounded bg-white font-medium"
                              />
                              <input
                                type="text"
                                value={g.example || ''}
                                onChange={(e) => updateGrammarItem(i, 'example', e.target.value)}
                                placeholder="例句 (如: Do you have paper? Yes, I do.)"
                                className="w-full px-2.5 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </>
          )}
        </div>

      </div>

      {/* 图片放大灯箱 Modal */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden p-2" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImageModal(null)}
              className="absolute top-3 right-3 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewImageModal} alt="Preview" className="max-h-[85vh] w-auto mx-auto object-contain" />
          </div>
        </div>
      )}

      {/* 整本 PDF 批量导入 Modal */}
      {showBatchBookModal && selectedBookCode && (
        <BatchBookImportModal
          bookCode={selectedBookCode}
          bookName={selectedBook?.name || selectedBookCode}
          onClose={() => {
            setShowBatchBookModal(false);
            selectBook(selectedBookCode);
          }}
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
// 📖 整本 PDF 批量智能流式导入 Modal
// ============================================================
function BatchBookImportModal({ bookCode, bookName, onClose }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [batchStart, setBatchStart] = useState(0);
  const BATCH_SIZE = 8; // 每次送 8 页给大模型处理

  const [processing, setProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [batchImages, setBatchImages] = useState([]);
  const [accumulatedUnits, setAccumulatedUnits] = useState([]);
  const [savingAll, setSavingAll] = useState(false);

  // 加载 PDF 文件并准备分批
  const handleSelectBookPdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setStatusMsg('正在初始化 PDF 引擎...');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;

      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setBatchStart(0);
      setAccumulatedUnits([]);
      setStatusMsg(`PDF 加载成功！共 ${doc.numPages} 页，预计分 ${Math.ceil(doc.numPages / BATCH_SIZE)} 批处理`);
    } catch (err) {
      alert('加载整本 PDF 失败: ' + err.message);
    }
    setProcessing(false);
  };

  // 处理当前批次
  const processCurrentBatch = async (startIdx) => {
    if (!pdfDoc) return;
    setProcessing(true);
    const start = startIdx !== undefined ? startIdx : batchStart;
    const end = Math.min(start + BATCH_SIZE, totalPages);
    setStatusMsg(`正在切片渲染第 ${start + 1} ~ ${end} 页 (共 ${totalPages} 页)...`);

    try {
      const images = [];
      const fd = new FormData();

      for (let p = start + 1; p <= end; p++) {
        const page = await pdfDoc.getPage(p);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.85));
        const url = URL.createObjectURL(blob);
        images.push({ blob, url, pageNum: p });
        fd.append('images', blob, `page-${p}.png`);
      }
      setBatchImages(images);

      setStatusMsg(`正在请求 AI 视觉模型提取第 ${start + 1} ~ ${end} 页...`);
      const res = await fetch(`${API_BASE_URL}/textbooks/preview-book/${bookCode}?batch_start=${start}`, {
        method: 'POST',
        headers: { 'X-API-Key': API_KEY },
        body: fd
      });
      const json = await res.json();

      if (json.data?.units) {
        const newUnits = json.data.units;
        setAccumulatedUnits(prev => {
          // 合并 units (根据 unit_number 去重或增量补充)
          const map = new Map();
          prev.forEach(u => map.set(u.unit_number, u));
          newUnits.forEach(u => {
            if (map.has(u.unit_number)) {
              const existing = map.get(u.unit_number);
              map.set(u.unit_number, {
                ...existing,
                unit_title: u.unit_title || existing.unit_title,
                vocab: [...(existing.vocab || []), ...(u.vocab || [])],
                patterns: [...(existing.patterns || []), ...(u.patterns || [])],
                grammar: [...(existing.grammar || []), ...(u.grammar || [])]
              });
            } else {
              map.set(u.unit_number, u);
            }
          });
          return Array.from(map.values()).sort((a, b) => a.unit_number - b.unit_number);
        });

        const nextStart = end;
        setBatchStart(nextStart);
        if (nextStart >= totalPages) {
          setStatusMsg(`🎉 整本书所有批次已提取完毕！已累计识别 ${accumulatedUnits.length + newUnits.length} 个单元，请确认后点击【全部保存入库】`);
        } else {
          setStatusMsg(`✅ 第 ${start + 1} ~ ${end} 页提取成功！可继续提取下一批`);
        }
      } else {
        alert('该批提取失败: ' + (json.error?.message || '未知错误'));
      }
    } catch (err) {
      alert('处理出错: ' + err.message);
    }
    setProcessing(false);
  };

  // 一键把所有识别到的 Units 写入 D1
  const handleCommitAllUnits = async () => {
    if (accumulatedUnits.length === 0) {
      alert('还没有任何已识别的单元');
      return;
    }
    setSavingAll(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/textbooks/commit-units/${bookCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ units: accumulatedUnits })
      });
      const json = await resp.json();
      if (json.data) {
        alert(`🎉 保存成功！共写入 ${json.data.units_written} 个单元内容至数据库与 R2`);
        onClose();
      } else {
        alert('保存失败: ' + (json.error?.message || '未知错误'));
      }
    } catch (err) {
      alert('保存请求出错: ' + err.message);
    }
    setSavingAll(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b bg-purple-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <div>
              <h2 className="text-sm font-bold text-gray-900">整本教材 PDF 批量流式导入 — {bookName} ({bookCode})</h2>
              <p className="text-xs text-gray-500">自动分批切片 · AI 自动按 Unit 归类 · 批量保存入库</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* 1. PDF 导入区 */}
          {!pdfDoc ? (
            <div className="border-2 border-dashed border-purple-200 rounded-2xl p-8 text-center bg-purple-50/30 hover:bg-purple-50/60 transition">
              <Upload className="w-10 h-10 text-purple-400 mx-auto mb-3" />
              <div className="text-sm font-bold text-gray-800 mb-1">选择整本教材原版 PDF 文件</div>
              <p className="text-xs text-gray-500 mb-4">系统将自动分批（每批 8 页）进行高清切图并由 AI 多模态识别各单元知识点</p>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-xs font-semibold rounded-xl hover:bg-purple-700 cursor-pointer shadow-sm">
                <span>📁 浏览本地 PDF 文件</span>
                <input type="file" accept="application/pdf" onChange={handleSelectBookPdf} className="hidden" />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 进度控制条 */}
              <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-purple-900">
                    当前进度: 第 {batchStart} / {totalPages} 页 ({Math.min(100, Math.round((batchStart / totalPages) * 100))}%)
                  </div>
                  <div className="text-xs text-purple-700 mt-0.5">{statusMsg}</div>
                </div>

                <div className="flex items-center gap-2">
                  {batchStart < totalPages && (
                    <button
                      type="button"
                      onClick={() => processCurrentBatch()}
                      disabled={processing}
                      className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 shadow-xs cursor-pointer"
                    >
                      {processing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{processing ? '正在提取...' : `提取下批 (P${batchStart + 1}~P${Math.min(batchStart + BATCH_SIZE, totalPages)})`}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 已累积识别的 Units 列表 */}
              <div>
                <div className="text-xs font-bold text-gray-800 mb-2 flex items-center justify-between">
                  <span>✨ 累积已提取单元 ({accumulatedUnits.length} 个):</span>
                  <span className="text-[11px] text-gray-500">词汇和句型已自动匹配双语对照</span>
                </div>

                {accumulatedUnits.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400 bg-gray-50 rounded-xl border">
                    请点击上方「提取下批」开始识别
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {accumulatedUnits.map((u, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 border rounded-xl flex items-start justify-between text-xs">
                        <div className="space-y-1">
                          <div className="font-bold text-gray-900 flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">
                              Unit {u.unit_number}
                            </span>
                            <span>{u.unit_title || `Unit ${u.unit_number}`}</span>
                          </div>
                          <div className="text-gray-600 text-[11px]">
                            🔤 核心词汇 ({(u.vocab || []).length} 个): {(u.vocab || []).slice(0, 6).map(v => `${v.word} (${v.translation})`).join(', ')}
                            {(u.vocab || []).length > 6 ? '...' : ''}
                          </div>
                          <div className="text-gray-600 text-[11px]">
                            💬 重点句型 ({(u.patterns || []).length} 条): {(u.patterns || []).slice(0, 2).map(p => p.pattern).join('; ')}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setAccumulatedUnits(prev => prev.filter((_, i) => i !== idx))}
                          className="text-gray-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-gray-600 hover:text-gray-800">
            取消 / 关闭
          </button>

          {accumulatedUnits.length > 0 && (
            <button
              type="button"
              onClick={handleCommitAllUnits}
              disabled={savingAll}
              className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 transition disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {savingAll ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
              <span>{savingAll ? '正在写入系统...' : `全部保存入库 (${accumulatedUnits.length} 个单元)`}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// 教材库管理子组件
function BooksManageModal({ books, onClose }) {
  const [list, setList] = useState(books || []);
  const [editingCode, setEditingCode] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', level: 'A1', publisher: 'Oxford', total_units: 8, description: '' });

  const handleSaveBook = async (e) => {
    e.preventDefault();
    if (!form.code || !form.name) return alert('Code 和名称必填');

    try {
      if (editingCode) {
        await request(`/textbooks/books-manage/${editingCode}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await request('/textbooks/books-manage', { method: 'POST', body: JSON.stringify(form) });
      }
      const resp = await request('/textbooks');
      setList(resp.data || []);
      setEditingCode(null);
      setForm({ code: '', name: '', level: 'A1', publisher: 'Oxford', total_units: 8, description: '' });
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="text-base font-bold text-gray-900">📚 教材目录管理</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <form onSubmit={handleSaveBook} className="p-4 bg-purple-50/60 border border-purple-200 rounded-xl space-y-3">
            <div className="text-xs font-bold text-purple-900">
              {editingCode ? `编辑教材: ${editingCode}` : '➕ 新增教材'}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">教材代码 (Code)</label>
                <input
                  type="text"
                  disabled={!!editingCode}
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  placeholder="如 EU-L4"
                  className="w-full px-2.5 py-1.5 text-xs border rounded bg-white font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">教材全称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="如 Everybody Up 4"
                  className="w-full px-2.5 py-1.5 text-xs border rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-600 mb-1">CEFR 等级</label>
                <select
                  value={form.level}
                  onChange={e => setForm({ ...form, level: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border rounded bg-white"
                >
                  <option value="Pre-A1">Pre-A1</option>
                  <option value="A1">A1</option>
                  <option value="A1+">A1+</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {editingCode && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCode(null);
                    setForm({ code: '', name: '', level: 'A1', publisher: 'Oxford', total_units: 8, description: '' });
                  }}
                  className="px-3 py-1 text-xs text-gray-600 bg-white border rounded"
                >
                  取消
                </button>
              )}
              <button type="submit" className="px-4 py-1 text-xs font-semibold bg-purple-600 text-white rounded hover:bg-purple-700">
                {editingCode ? '更新' : '添加'}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-700">现有教材列表</div>
            {list.map(b => (
              <div key={b.code} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 text-xs">
                <div>
                  <span className="font-bold text-gray-900 mr-2">{b.name}</span>
                  <span className="text-gray-500 mr-2">({b.code})</span>
                  <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">{b.level}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingCode(b.code);
                      setForm({ code: b.code, name: b.name, level: b.level || 'A1', publisher: b.publisher || 'Oxford', total_units: b.total_units || 8, description: b.description || '' });
                    }}
                    className="text-purple-600 hover:text-purple-800 p-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteBook(b.code)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
