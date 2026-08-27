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
  const [showLlmSettingsModal, setShowLlmSettingsModal] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState(null);

  // AI 视觉模型设置 (支持 localStorage 持久化)
  const [llmConfig, setLlmConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('sb_llm_config');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      provider: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: '',
      model: 'google/gemma-3n-e4b-it'
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
          {/* AI 视觉模型设置 */}
          <button
            type="button"
            onClick={() => setShowLlmSettingsModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition shadow-2xs cursor-pointer"
            title="配置视觉大模型 (OpenAI / 智谱 GLM / Qwen / NVIDIA)"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>⚙️ AI 模型设置</span>
          </button>

          {/* 整本 PDF 批量导入按钮 */}
          <button
            type="button"
            onClick={() => setShowBatchBookModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition shadow-2xs cursor-pointer"
          >
            <Book className="w-3.5 h-3.5 text-purple-600" />
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

function BatchBookImportModal({ bookCode, bookName, llmConfig, onClose }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  
  // 页码偏移量 (PDF 真实页码 = 课本印刷页码 + pageOffset)
  // 如课本第 2 页 (Welcome) 在 PDF 的第 4 页，则 offset = 2
  const [pageOffset, setPageOffset] = useState(2);
  const [previewThumbnail, setPreviewThumbnail] = useState(null);
  const [previewingPdfPage, setPreviewingPdfPage] = useState(4);

  // 单元目录大纲列表
  const [outline, setOutline] = useState(() => {
    const preset = DEFAULT_OUTLINES[bookCode] || DEFAULT_OUTLINES['DEFAULT'];
    return preset.map(u => ({ ...u, selected: true, status: 'idle', vocabCount: 0, patternCount: 0, extractedData: null }));
  });

  const [processing, setProcessing] = useState(false);
  const [currentProcessingUnit, setCurrentProcessingUnit] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [savingAll, setSavingAll] = useState(false);

  // 加载 PDF 文件并渲染第 4 页进行对齐校验
  const handleSelectBookPdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setStatusMsg('正在解析 PDF 文件...');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;

      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setStatusMsg(`PDF 加载成功！共 ${doc.numPages} 页`);
      
      // 渲染校准对照图 (默认取 PDF 第 4 页)
      renderOffsetSample(doc, 2 + pageOffset);
    } catch (err) {
      alert('加载整本 PDF 失败: ' + err.message);
    }
    setProcessing(false);
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
        extractedData: null
      }];
    });
  };

  // 开始按大纲精准流式提取
  const handleStartOutlineExtraction = async () => {
    if (!pdfDoc) return;
    const selectedUnits = outline.filter(u => u.selected);
    if (selectedUnits.length === 0) {
      alert('请至少勾选一个需要提取的单元');
      return;
    }

    setProcessing(true);

    for (let idx = 0; idx < outline.length; idx++) {
      const item = outline[idx];
      if (!item.selected) continue;

      setCurrentProcessingUnit(item.unit_number);
      updateOutlineItem(idx, 'status', 'processing');

      // 计算本 Unit 对应的真实 PDF 页码范围
      const pdfStart = item.page_from + pageOffset;
      const pdfEnd = item.page_to + pageOffset;

      if (pdfStart > totalPages) {
        updateOutlineItem(idx, 'status', 'error');
        continue;
      }

      const realPdfEnd = Math.min(pdfEnd, totalPages);
      setStatusMsg(`正在处理 Unit ${item.unit_number} (${item.unit_title}): 切片课本第 ${item.page_from}-${item.page_to} 页 (对应 PDF 第 ${pdfStart}-${realPdfEnd} 页)...`);

      try {
        const fd = new FormData();
        const pageBlobs = [];

        // 1. 逐页高清切片 (用于 R2 存储与教师/家长端精确展示)
        for (let p = pdfStart; p <= realPdfEnd; p++) {
          const bookPageNum = p - pageOffset; // 对应的真实课本页码
          const page = await pdfDoc.getPage(p);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
          pageBlobs.push({ blob, pageNum: bookPageNum });
          fd.append('images', blob, `page-${String(bookPageNum).padStart(2, '0')}.jpg`);
        }

        // 2. 核心：为 AI 视觉模型合成单张全景拼图 (彻底解决 Llama 等模型单图限制)
        if (pageBlobs.length > 0) {
          const coreBlobs = pageBlobs.slice(0, Math.min(4, pageBlobs.length));
          const loadedImgs = await Promise.all(coreBlobs.map(b => new Promise(res => {
            const img = new Image();
            img.onload = () => res(img);
            img.src = URL.createObjectURL(b.blob);
          })));

          const cols = loadedImgs.length === 1 ? 1 : 2;
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
          // 把拼图作为 ai_vision.jpg 传给后端
          fd.append('ai_vision', collageBlob, 'ai_vision.jpg');
        }

        // 同时在 FormData 和 Header 中携带配置 (双重保障避免被拦截)
        if (llmConfig?.baseUrl) fd.append('llm_base_url', llmConfig.baseUrl);
        if (llmConfig?.apiKey) fd.append('llm_api_key', llmConfig.apiKey);
        if (llmConfig?.model) fd.append('llm_model', llmConfig.model);

        setStatusMsg(`正在调用 AI 视觉模型提取 Unit ${item.unit_number} 词汇与句型...`);
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
          setOutline(prev => {
            const list = [...prev];
            list[idx] = {
              ...list[idx],
              status: 'success',
              vocabCount: (d.vocab || []).length,
              patternCount: (d.patterns || []).length,
              extractedData: {
                unit_number: item.unit_number,
                unit_title: d.unit_title || item.unit_title,
                page_from: item.page_from,
                page_to: item.page_to,
                vocab: d.vocab || [],
                patterns: d.patterns || [],
                grammar: d.grammar || []
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
      } catch (err) {
        console.error(err);
        setOutline(prev => {
          const list = [...prev];
          list[idx] = { ...list[idx], status: 'error', errorMsg: err.message };
          return list;
        });
        setStatusMsg(`⚠️ Unit ${item.unit_number} 请求异常: ${err.message}`);
      }
    }

    setProcessing(false);
    setCurrentProcessingUnit(null);
    setStatusMsg('🎉 批次处理完毕！请查看各单元状态');
  };

  // 全部保存入库
  const handleCommitAll = async () => {
    const readyUnits = outline.filter(u => u.status === 'success' && u.extractedData).map(u => u.extractedData);
    if (readyUnits.length === 0) {
      alert('暂无已提取成功的单元数据');
      return;
    }

    setSavingAll(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/textbooks/commit-units/${bookCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ units: readyUnits })
      });
      const json = await resp.json();
      if (json.data) {
        alert(`🎉 恭喜！已将 ${json.data.units_written} 个单元的所有切图与知识点全部存入系统与 R2！`);
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-3.5 border-b bg-purple-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                目录大纲驱动 · 印刷页码精准对齐导入 — {bookName} ({bookCode})
              </h2>
              <p className="text-xs text-gray-500">按真实课本目录切片 · 切图页码与印刷页码 100% 绝对对齐 · 零错位</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. 上传整本 PDF */}
          {!pdfDoc ? (
            <div className="border-2 border-dashed border-purple-200 rounded-2xl p-8 text-center bg-purple-50/30 hover:bg-purple-50/60 transition">
              <Upload className="w-10 h-10 text-purple-400 mx-auto mb-3" />
              <div className="text-sm font-bold text-gray-800 mb-1">请选择《{bookName}》整本原版 PDF 文件</div>
              <p className="text-xs text-gray-500 mb-4">系统将结合目录大纲自动按各 Unit 精准切片，并让切图页码与课本印刷页码完全对应</p>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white text-xs font-semibold rounded-xl hover:bg-purple-700 cursor-pointer shadow-sm">
                <span>📁 浏览本地 PDF 文件</span>
                <input type="file" accept="application/pdf" onChange={handleSelectBookPdf} className="hidden" />
              </label>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 2. 核心：页码偏移量校准器 (Offset) */}
              <div className="p-4 bg-linear-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-purple-950 flex items-center gap-2">
                    <span>🎯 页码偏移量校准 (Page Offset)</span>
                    <span className="px-2 py-0.5 bg-purple-200 text-purple-800 rounded text-[11px]">
                      当前偏移: +{pageOffset}
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800">
                    计算公式：<b>PDF 真实页码 = 课本印刷页码 + {pageOffset}</b>（例如 Welcome 印刷第 2 页 对应 PDF 第 {2 + pageOffset} 页）
                  </p>
                </div>

                {/* 调节按钮与微调器 */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center border border-purple-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleOffsetChange(pageOffset - 1)}
                      className="px-3 py-1.5 text-xs text-purple-700 hover:bg-purple-50 font-bold border-r"
                    >
                      -1
                    </button>
                    <span className="px-3 py-1 text-xs font-bold text-gray-800">+{pageOffset}</span>
                    <button
                      type="button"
                      onClick={() => handleOffsetChange(pageOffset + 1)}
                      className="px-3 py-1.5 text-xs text-purple-700 hover:bg-purple-50 font-bold border-l"
                    >
                      +1
                    </button>
                  </div>

                  {/* 缩略图肉眼核对 */}
                  {previewThumbnail && (
                    <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border shadow-2xs">
                      <img src={previewThumbnail} alt="Preview" className="h-12 w-auto object-contain rounded border" />
                      <div className="text-[10px] text-gray-500 text-left">
                        <div>已定位至 PDF 第 <b>{previewingPdfPage}</b> 页</div>
                        <div className="text-green-600 font-medium">✓ 核对是否为 Welcome 页</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. 单元目录大纲表格 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-gray-800 flex items-center gap-2">
                    <span>📖 单元精准切片大纲 ({outline.length} 单元)</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected = outline.every(u => u.selected);
                        setOutline(prev => prev.map(u => ({ ...u, selected: !allSelected })));
                      }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      {outline.every(u => u.selected) ? '取消全选' : '全选'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addOutlineUnit}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> 添加单元
                    </button>

                    <button
                      type="button"
                      onClick={handleStartOutlineExtraction}
                      disabled={processing}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition disabled:opacity-50 shadow-xs cursor-pointer"
                    >
                      {processing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{processing ? '正在精准切片提取...' : '🚀 开始按大纲切片提取'}</span>
                    </button>
                  </div>
                </div>

                {statusMsg && (
                  <div className="text-xs text-purple-700 bg-purple-50/70 p-2 rounded-lg mb-2 font-medium">
                    {statusMsg}
                  </div>
                )}

                {/* 表格 */}
                <div className="border rounded-xl overflow-hidden bg-white shadow-2xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 border-b text-gray-600">
                      <tr>
                        <th className="p-2.5 w-10 text-center">选</th>
                        <th className="p-2.5 w-16">Unit</th>
                        <th className="p-2.5">单元标题 (Title)</th>
                        <th className="p-2.5 w-32">课本印刷页码</th>
                        <th className="p-2.5 w-32">对应 PDF 页码</th>
                        <th className="p-2.5 w-28 text-center">提取状态</th>
                        <th className="p-2.5 w-36">知识点概况</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {outline.map((u, idx) => {
                        const pdfFrom = u.page_from + pageOffset;
                        const pdfTo = u.page_to + pageOffset;
                        const isProcessingThis = currentProcessingUnit === u.unit_number;

                        return (
                          <tr key={idx} className={isProcessingThis ? 'bg-purple-50/80 font-medium' : 'hover:bg-gray-50/60'}>
                            <td className="p-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={u.selected}
                                onChange={e => updateOutlineItem(idx, 'selected', e.target.checked)}
                                className="rounded text-purple-600 focus:ring-purple-500"
                              />
                            </td>
                            <td className="p-2.5 font-bold text-gray-900">U{u.unit_number}</td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={u.unit_title}
                                onChange={e => updateOutlineItem(idx, 'unit_title', e.target.value)}
                                className="w-full px-2 py-1 border rounded text-xs bg-white"
                              />
                            </td>
                            <td className="p-2.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={u.page_from}
                                  onChange={e => updateOutlineItem(idx, 'page_from', parseInt(e.target.value) || 0)}
                                  className="w-12 px-1.5 py-1 border rounded text-xs text-center"
                                />
                                <span>-</span>
                                <input
                                  type="number"
                                  value={u.page_to}
                                  onChange={e => updateOutlineItem(idx, 'page_to', parseInt(e.target.value) || 0)}
                                  className="w-12 px-1.5 py-1 border rounded text-xs text-center"
                                />
                                <span className="text-gray-400 text-[10px]">页</span>
                              </div>
                            </td>
                            <td className="p-2.5 text-gray-500 font-medium">
                              第 {pdfFrom} - {pdfTo} 页
                            </td>
                            <td className="p-2.5 text-center">
                              {u.status === 'processing' ? (
                                <span className="text-purple-600 flex items-center justify-center gap-1 font-medium">
                                  <Loader className="w-3 h-3 animate-spin" /> 提取中
                                </span>
                              ) : u.status === 'success' ? (
                                <span className="text-green-600 font-semibold flex items-center justify-center gap-0.5">
                                  <Check className="w-3.5 h-3.5" /> 已就绪
                                </span>
                              ) : u.status === 'error' ? (
                                <div className="text-red-500 font-medium flex flex-col items-center">
                                  <span>❌ 失败</span>
                                  {u.errorMsg && <span className="text-[9px] text-red-600 max-w-[120px] truncate" title={u.errorMsg}>{u.errorMsg}</span>}
                                </div>
                              ) : (
                                <span className="text-gray-400">待处理</span>
                              )}
                            </td>
                            <td className="p-2.5 text-gray-600 text-[11px]">
                              {u.status === 'success' ? (
                                <span className="text-purple-700 font-medium">
                                  {u.vocabCount} 词汇 · {u.patternCount} 句型
                                </span>
                              ) : u.errorMsg ? (
                                <span className="text-red-500 text-[10px]" title={u.errorMsg}>
                                  {u.errorMsg.substring(0, 30)}...
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t bg-gray-50 flex items-center justify-between shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-gray-600 hover:text-gray-800">
            关闭
          </button>

          {successCount > 0 && (
            <button
              type="button"
              onClick={handleCommitAll}
              disabled={savingAll}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 transition disabled:opacity-50 shadow-md cursor-pointer"
            >
              {savingAll ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
              <span>{savingAll ? '正在入库...' : `💾 全部保存入库 (${successCount} 个单元)`}</span>
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

// ============================================================
// ⚙️ AI 视觉大模型设置 Modal (支持常用预设与连通性测试)
// ============================================================
const LLM_PRESETS = [
  {
    id: 'nvidia',
    name: 'NVIDIA NIM (推荐, 免费视觉多模态)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.2-11b-vision-instruct',
    desc: '免费提供 1000 次调用额度，强大多模态视觉切片识别'
  },
  {
    id: 'nvidia_qwen',
    name: 'NVIDIA Qwen2.5-VL',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'qwen/qwen2.5-vl-72b-instruct',
    desc: 'NVIDIA 平台上的 Qwen2.5 视觉旗舰大模型，中英双语极准'
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

  // 测试连接性
  const handleTestConnection = async () => {
    if (!form.apiKey) {
      alert('请先输入 API Key');
      return;
    }
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
          api_key: form.apiKey,
          model: form.model
        })
      });
      const json = await resp.json();

      if (json.data?.success) {
        setTestResult({
          success: true,
          msg: `✅ 连接成功！响应耗时: ${json.data.elapsed_ms}ms\n模型回复: "${json.data.reply}"`
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
    e.preventDefault();
    if (!form.apiKey) {
      if (!confirm('您尚未填写 API Key，确定保存吗？(未配置 Key 将无法使用 AI 识别)')) return;
    }
    onSave(form);
    alert('✅ AI 视觉模型配置已保存并生效！');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-indigo-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">AI 视觉大模型配置中心</h2>
              <p className="text-xs text-gray-500">自由切换 OpenAI、智谱 GLM、通义千问、NVIDIA NIM 或自定义接口</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* 预设平台快速切换 */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700">1. 选择模型服务商</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LLM_PRESETS.map(p => {
                const isSelected = form.provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-500 shadow-2xs ring-1 ring-indigo-400/30'
                        : 'bg-white border-gray-200 hover:border-indigo-200 hover:bg-gray-50/50'
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-bold ${isSelected ? 'text-indigo-900' : 'text-gray-800'}`}>
                        {p.name}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 line-clamp-2">{p.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 详细参数配置 */}
          <div className="space-y-3.5 p-4 bg-gray-50/80 rounded-xl border">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                API Base URL (接口地址)
              </label>
              <input
                type="text"
                value={form.baseUrl || ''}
                onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="如 https://integrate.api.nvidia.com/v1"
                className="w-full px-3 py-2 text-xs border rounded-lg bg-white font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Model Name (模型名称)
              </label>
              <input
                type="text"
                value={form.model || ''}
                onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder="如 google/gemma-3n-e4b-it / glm-4v-flash / gpt-4o-mini"
                className="w-full px-3 py-2 text-xs border rounded-lg bg-white font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
                <span>API Key (密钥)</span>
                <span className="text-[10px] text-gray-400 font-normal">保存在本地浏览器中，调用时直接传输</span>
              </label>
              <input
                type="password"
                value={form.apiKey || ''}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
                placeholder="粘贴对应的 API Key (如 nvapi-... / sk-...)"
                className="w-full px-3 py-2 text-xs border rounded-lg bg-white font-mono"
              />
            </div>
          </div>

          {/* 连通性测试结果 */}
          {testResult && (
            <div className={`p-3 rounded-xl text-xs font-mono whitespace-pre-wrap border ${
              testResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {testResult.msg}
            </div>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !form.apiKey}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl hover:bg-indigo-100 disabled:opacity-50 transition border border-indigo-200"
            >
              {testing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{testing ? '正在测试连接...' : '🧪 测试连接'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-gray-600 hover:text-gray-800"
              >
                取消
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>保存配置并生效</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
