import { useState, useEffect, useRef } from 'react';
import { Book, FileText, Upload, Sparkles, Loader, CheckCircle, XCircle, Trash2, ChevronRight, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { request } from '../store/api';

export default function Textbooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);

  useEffect(() => { loadBooks(); }, []);

  const loadBooks = async () => {
    setLoading(true);
    try {
      const resp = await request('/textbooks');
      setBooks(resp.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // 打开单个教材
  const openBook = async (code) => {
    try {
      const resp = await request(`/textbooks/book/${code}`);
      setSelectedBook(resp.data);
      setSelectedUnit(null);
    } catch (e) { alert('加载教材失败'); }
  };

  // 打开单元 (显示内容 + 上传 + 提取区)
  const openUnit = async (unit) => {
    setSelectedUnit(unit);
    // 拉内容
    try {
      const resp = await request(`/textbooks/content/${selectedBook.code}/${unit.unit_number}`);
      // 文件头有 404 时 resp 没有 data,就当成空
      if (resp.data) setUnitContent(resp.data);
      else setUnitContent(null);
    } catch {
      setUnitContent(null);
    }
  };

  const [unitContent, setUnitContent] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState(null);
  const [extractError, setExtractError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  // 浏览器端 PDF 转图片 (PDF.js render 到 canvas,导出 PNG blob)
  const [renderedImages, setRenderedImages] = useState([]);  // [{blob, url}]
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [bookMode, setBookMode] = useState(false);  // false=单unit, true=整本书

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRenderedImages([]); setRenderError(''); setRenderError('');
    setExtractResult(null); setExtractError('');

    if (!file.type.includes('pdf')) {
      // 非PDF,直接当图片用
      setRenderedImages([{ blob: file, url: URL.createObjectURL(file) }]);
      return;
    }

    // PDF → 用 pdfjs 渲染每页为 PNG (动态加载,避免顶层 PDF worker 未初始化)
    setRendering(true);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setTotalPages(pdf.numPages);
      pdfDocRef.current = pdf;  // 保存 pdf 文档,后续切批不用重新解析
      setPdfFileRef(file);  // 保留 file 引用

      // 整本书模式按批次渲染 (batchStart..batchStart+BATCH_SIZE),单 unit 模式渲染前 8 页
      const startPage = bookMode ? (batchStart + 1) : 1;
      const maxPages = bookMode ? Math.min(BATCH_SIZE, pdf.numPages - batchStart) : Math.min(BATCH_SIZE, pdf.numPages);
      const images = [];
      for (let i = 0; i < maxPages; i++) {
        const pageNum = startPage + i;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.85));
        images.push({ blob, url: URL.createObjectURL(blob) });
      }
      setRenderedImages(images);
      if (bookMode && pdf.numPages > batchStart + BATCH_SIZE) {
        setRenderError(`当前批次: 第 ${batchStart+1}-${batchStart + images.length} 页 (共 ${pdf.numPages} 页). 还剩 ${pdf.numPages - batchStart - images.length} 页未处理`);
      }
    } catch (err) {
      setRenderError('PDF 渲染失败: ' + err.message);
      console.error('PDF render error:', err);
    }
    setRendering(false);
  };

  // 触发上传图片 + LLM 提取 (单 Unit 模式: 不写库,先弹校对 Modal)
  const handleExtractPreview = async () => {
    if (renderedImages.length === 0) { alert('请先选择 PDF 文件并等待转换为图片'); return; }
    setExtracting(true); setExtractError(''); setPreviewUnits(null);
    try {
      const fd = new FormData();
      renderedImages.forEach((img, i) => fd.append('images', img.blob, `page-${i+1}.png`));
      const url = `/textbooks/preview-unit/${selectedBook.code}/${selectedUnit.unit_number}`;
      const r = await fetch(`https://api.changtian.dpdns.org/api/v1${url}`, {
        method: 'POST',
        headers: { 'X-API-Key': 'sunnybridge-dev-key-2024' },
        body: fd
      });
      const resp = await r.json();
      if (resp.data) {
        // /preview-unit 返回单个 unit 对象,放进 array 复用整本书的校对 Modal
        setPreviewUnits([resp.data]);
        setShowReviewModal(true);
      } else {
        setExtractError(resp.error?.message || '提取失败');
      }
    } catch (e) { setExtractError(e.message); }
    setExtracting(false);
  };

  // 单元管理 Modal (直接增删改 textbook_units 列表)
  const [showUnitsManage, setShowUnitsManage] = useState(false);
  const [manageUnits, setManageUnits] = useState([]);  // 从 /units-manage 返回的 unit 列表
  const [manageLoading, setManageLoading] = useState(false);
  const [newUnitNum, setNewUnitNum] = useState('');
  const [newUnitTitle, setNewUnitTitle] = useState('');

  // ====== 教材库管理 Modal (直接增删改 textbooks 表) ======
  const [showBooksManage, setShowBooksManage] = useState(false);
  const [manageBooks, setManageBooks] = useState([]);
  const [booksManageLoading, setBooksManageLoading] = useState(false);
  const [newBook, setNewBook] = useState({ code: '', name: '', level: '', publisher: '', total_units: 8, description: '' });

  const openBooksManage = async () => {
    setShowBooksManage(true);
    setBooksManageLoading(true);
    try {
      // 复用 GET / 返回的 books 列表
      setManageBooks(books);
    } catch (e) { alert('加载教材列表失败: ' + e.message); }
    setBooksManageLoading(false);
  };

  const updateManageBook = async (code, field, value) => {
    setManageBooks(prev => prev.map(b => b.code === code ? { ...b, [field]: value } : b));
    try {
      await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/books-manage/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'sunnybridge-dev-key-2024' },
        body: JSON.stringify({ [field]: field === 'total_units' || field === 'is_active' ? (field === 'is_active' ? Boolean(value) : parseInt(value)) : value })
      });
    } catch (e) {
      alert('保存失败: ' + e.message);
      loadBooks();  // 回滚
    }
  };

  const addManageBook = async () => {
    if (!newBook.code || !newBook.name) { alert('code 和 name 必填'); return; }
    try {
      const r = await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/books-manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'sunnybridge-dev-key-2024' },
        body: JSON.stringify(newBook)
      });
      const resp = await r.json();
      if (resp.data) {
        setNewBook({ code: '', name: '', level: '', publisher: '', total_units: 8, description: '' });
        loadBooks();
        setManageBooks(books);
        alert(`✅ 新教材 ${newBook.code} 已创建\n下一步: 进入这本教材 → 点 "管理单元列表" 新增单元`);
      } else {
        alert(resp.error?.message || '新增失败');
      }
    } catch (e) { alert('新增失败: ' + e.message); }
  };

  const deleteManageBook = async (code, name) => {
    if (!confirm(`删除整本教材 ${name} (${code})?\n\n这本教材的所有 unit 和 AI 提取内容都会一并删除!\n\n此操作不可恢复,确认吗?`)) return;
    try {
      await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/books-manage/${code}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': 'sunnybridge-dev-key-2024' }
      });
      loadBooks();
      setManageBooks(books);
      alert(`已删除 ${name} (${code})`);
    } catch (e) { alert('删除失败: ' + e.message); }
  };

  const openUnitsManage = async () => {
    if (!selectedBook) return;
    setShowUnitsManage(true);
    setManageLoading(true);
    try {
      const r = await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/units-manage/${selectedBook.code}`,
        { headers: { 'X-API-Key': 'sunnybridge-dev-key-2024' } });
      const resp = await r.json();
      setManageUnits(resp.data?.units || []);
    } catch (e) { alert('加载单元列表失败: ' + e.message); }
    setManageLoading(false);
  };

  const refreshUnitsManage = async () => {
    const r = await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/units-manage/${selectedBook.code}`,
      { headers: { 'X-API-Key': 'sunnybridge-dev-key-2024' } });
    const resp = await r.json();
    setManageUnits(resp.data?.units || []);
  };

  const updateManageUnit = async (idx, field, value) => {
    const u = manageUnits[idx];
    const oldNum = u.unit_number;
    // 本地立即更新 (乐观)
    setManageUnits(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
    try {
      // 改 unit_number 是单独路径
      if (field === 'unit_number' && value !== oldNum) {
        await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/units-manage/${selectedBook.code}/${oldNum}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'sunnybridge-dev-key-2024' },
          body: JSON.stringify({ new_unit_number: parseInt(value) || 0 })
        });
      } else if (field !== 'unit_number') {
        await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/units-manage/${selectedBook.code}/${oldNum}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'sunnybridge-dev-key-2024' },
          body: JSON.stringify({ [field]: field === 'is_active' ? Boolean(value) : (field === 'lesson_count' ? parseInt(value) : value) })
        });
      }
    } catch (e) {
      alert('保存失败: ' + e.message);
      refreshUnitsManage();
    }
  };

  const deleteManageUnit = async (num) => {
    if (!confirm(`删除 Unit ${num}?\n该单元的 AI 提取内容也会一并删除`)) return;
    try {
      await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/units-manage/${selectedBook.code}/${num}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': 'sunnybridge-dev-key-2024' }
      });
      refreshUnitsManage();
    } catch (e) { alert('删除失败: ' + e.message); }
  };

  const addManageUnit = async () => {
    if (!newUnitNum) { alert('请填 unit 编号'); return; }
    try {
      await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/units-manage/${selectedBook.code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'sunnybridge-dev-key-2024' },
        body: JSON.stringify({ unit_number: parseInt(newUnitNum), unit_title: newUnitTitle, lesson_count: 1, is_active: true })
      });
      setNewUnitNum(''); setNewUnitTitle('');
      refreshUnitsManage();
    } catch (e) { alert('新增失败: ' + e.message); }
  };

  // 单元管理 Modal 完成 — 接上述 addManageUnit/etc
  // ========================================
  // 整本书模式批量提取 state
  // ========================================
  // 整本书模式: 上传 8 页 → AI 自动分单元 → 先返回预览 (不写库)
  // 用户校对完点 "确认保存" 调 commit-units 才写库
  // 支持分批: 每批 8 页,AI 识别后追加到 accumulatedUnits
  const [previewUnits, setPreviewUnits] = useState(null);
  const [accumulatedUnits, setAccumulatedUnits] = useState([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [batchStart, setBatchStart] = useState(0);
  const BATCH_SIZE = 8;  // NIM gemma-3n 实测稳定 8 页
  const [totalPages, setTotalPages] = useState(0);

  // 当前批次的图片 (computed from renderedImages + batchStart)
  // 我们让 PDF.js 渲染当前 batch 的 20 页,而不是整本一次性

  const handleExtractBook = async () => {
    if (renderedImages.length === 0) { alert('请先选择 PDF 并等待渲染'); return; }
    setExtracting(true); setExtractError(''); setPreviewUnits(null);
    try {
      // 发到后端的图片最多 8 页 (z.ai GLM-4.6V 上限)
      // BATCH_SIZE=8, 渲染也是 8,所以这里直接全部发
      // 注: 用 batch_start 参数告知后端这是第几页起 (用于 R2 保存图片名使用真实页码)
      const fd = new FormData();
      renderedImages.forEach((img, i) => fd.append('images', img.blob, `page-${batchStart + i + 1}.png`));
      const r = await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/preview-book/${selectedBook.code}?batch_start=${batchStart}`, {
        method: 'POST',
        headers: { 'X-API-Key': 'sunnybridge-dev-key-2024' },
        body: fd
      });
      const resp = await r.json();
      if (resp.data?.units) {
        setPreviewUnits(resp.data.units);
        setShowReviewModal(true);
      } else {
        setExtractError(resp.error?.message || '整本书识别失败');
      }
    } catch (e) { setExtractError(e.message); }
    setExtracting(false);
  };

  // 把当前批次的 previewUnits 追加到 accumulatedUnits (校对完点"确认这批,处理下一批")
  const handleAppendBatch = () => {
    if (!previewUnits || previewUnits.length === 0) {
      alert('本批没有任何识别结果,直接跳到下一批');
      setShowReviewModal(false);
      setPreviewUnits(null);
      // 自动切到下一批
      handleNextBatch();
      return;
    }
    setAccumulatedUnits(prev => [...prev, ...previewUnits]);
    setShowReviewModal(false);
    setPreviewUnits(null);
    // 自动切到下一批
    setTimeout(() => handleNextBatch(), 100);
  };

  // 翻到下一批 (重新渲染页 batchStart+8 ~ batchStart+16 ...) — 直接调 pdfjs
  // 需要保存 file 引用以便重渲染不同页面
  const [pdfFileRef, setPdfFileRef] = useState(null);
  const pdfDocRef = useRef(null);  // 保留已加载的 pdf 文档避免重复解析

  const handleNextBatch = async () => {
    const nextStart = batchStart + BATCH_SIZE;
    if (nextStart >= totalPages) {
      alert(`🎉 已处理完整本书所有页!\n累积 ${accumulatedUnits.length} 个 unit,请点页面上的 "全部保存到数据库" 按钮`);
      return;
    }
    setBatchStart(nextStart);

    // 直接重新渲染下一批 (无需让用户再选 PDF)
    if (!pdfDocRef.current) {
      alert('PDF 已卸载,请重新选 PDF 继续 (batchStart 已加 ' + BATCH_SIZE + ', 即下一批从 ' + (nextStart+1) + ' 页起)');
      return;
    }
    setRendering(true);
    try {
      const pdf = pdfDocRef.current;
      const startPage = nextStart + 1;
      const maxPages = Math.min(BATCH_SIZE, pdf.numPages - nextStart);
      const images = [];
      for (let i = 0; i < maxPages; i++) {
        const pageNum = startPage + i;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.85));
        images.push({ blob, url: URL.createObjectURL(blob) });
      }
      // revoke 旧图的 URL 避免内存泄漏
      renderedImages.forEach(img => URL.revokeObjectURL(img.url));
      setRenderedImages(images);
      if (pdf.numPages > nextStart + BATCH_SIZE) {
        setRenderError(`当前批次: 第 ${nextStart+1}-${nextStart + images.length} 页 (共 ${pdf.numPages} 页). 还剩 ${pdf.numPages - nextStart - images.length} 页未处理`);
      } else {
        setRenderError(`最后一批次: 第 ${nextStart+1}-${nextStart + images.length} 页 (共 ${pdf.numPages} 页)`);
      }
    } catch (err) {
      setRenderError('下一批 PDF 渲染失败: ' + err.message);
    }
    setRendering(false);
  };

  // 一次性把累积的所有 unit 写入 D1
  const handleCommitAll = async () => {
    if (accumulatedUnits.length === 0 && (!previewUnits || previewUnits.length === 0)) {
      alert('还没有任何已校对的内容,请先 AI 识别并确认各批内容');
      return;
    }
    const allUnits = [...accumulatedUnits];
    if (previewUnits && previewUnits.length > 0) allUnits.push(...previewUnits);
    setCommitting(true);
    try {
      const r = await fetch(`https://api.changtian.dpdns.org/api/v1/textbooks/commit-units/${selectedBook.code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'sunnybridge-dev-key-2024' },
        body: JSON.stringify({ units: allUnits })
      });
      const resp = await r.json();
      if (resp.data) {
        const d = resp.data;
        alert(`✅ 已保存!\n识别 ${d.units_received} 个 unit → 写入 ${d.units_written} 个:\n${(d.written || []).map(w => `  Unit ${w.unit_number} (${w.unit_title||''}): ${w.vocab_count} 词, ${w.patterns_count} 句型`).join('\n')}\n\n跳过 ${d.units_skipped?.length || 0} 个`);
        setShowReviewModal(false);
        setPreviewUnits(null);
        setAccumulatedUnits([]);
        setBatchStart(0);
        openBook(selectedBook.code);
        setSelectedUnit(null);
      } else {
        alert(resp.error?.message || '保存失败');
      }
    } catch (e) { alert('保存失败: ' + e.message); }
    setCommitting(false);
  };

  // 编辑 previewUnits 的辅助函数
  const updateUnitField = (idx, field, value) => {
    setPreviewUnits(prev => prev.map((u, i) => i === idx ? { ...u, [field]: value } : u));
  };
  const removeVocab = (unitIdx, vocabIdx) => {
    setPreviewUnits(prev => prev.map((u, i) => i === unitIdx ? { ...u, vocab: (u.vocab || []).filter((_, j) => j !== vocabIdx) } : u));
  };
  const removePattern = (unitIdx, patIdx) => {
    setPreviewUnits(prev => prev.map((u, i) => i === unitIdx ? { ...u, patterns: (u.patterns || []).filter((_, j) => j !== patIdx) } : u));
  };
  const removeGrammar = (unitIdx, gIdx) => {
    setPreviewUnits(prev => prev.map((u, i) => i === unitIdx ? { ...u, grammar: (u.grammar || []).filter((_, j) => j !== gIdx) } : u));
  };
  const removeUnit = (idx) => {
    if (!confirm('删除此单元全部内容?')) return;
    setPreviewUnits(prev => prev.filter((_, i) => i !== idx));
  };
  // 删除累积数组里的 unit (已校对的)
  const removeAccumulatedUnit = (idx) => {
    if (!confirm('从已校对累积列表里删除此 unit?')) return;
    setAccumulatedUnits(prev => prev.filter((_, i) => i !== idx));
  };

  // 保存提取结果到 D1 (用 extract 返回的已存的内容, 或者用校对后的)
  const handleSaveContent = async (content) => {
    setSaving(true);
    try {
      const resp = await request(`/textbooks/content/${selectedBook.code}/${selectedUnit.unit_number}`, {
        method: 'POST',
        body: JSON.stringify({ ...content, extracted_by: 'llm' })
      });
      if (resp.data) { alert('✅ 已保存'); openUnit(selectedUnit); }
      else { alert(resp.error?.message || '保存失败'); }
    } catch (e) { alert('保存失败: ' + e.message); }
    setSaving(false);
  };

  // 删除 R2 里的 PDF
  const [pdfs, setPdfs] = useState([]);
  const loadPdfs = async () => {
    try {
      const resp = await request('/textbooks/pdfs');
      setPdfs(resp.data || []);
    } catch { setPdfs([]); }
  };
  useEffect(() => { loadPdfs(); }, []);

  // ====== 渲染 ======
  if (loading) return <div className="p-8 text-gray-500">加载中...</div>;

  // 三级视图: 教材列表 → 单本教材单元列表 → 单元详细 (PDF + 提取 + 编辑)
  if (!selectedBook) {
    return (
      <div className="p-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Book className="w-6 h-6 text-primary-600" />📚 教材库</h1>
          <button
            onClick={openBooksManage}
            className="px-4 py-2 text-sm border-2 border-purple-400 text-purple-700 rounded-lg hover:bg-purple-50 font-medium"
          >
            ⚙️ 管理教材列表
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map(b => (
            <div key={b.code} onClick={() => openBook(b.code)} className="border rounded-lg p-4 hover:shadow-md hover:border-primary-300 cursor-pointer transition">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-gray-800">{b.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{b.publisher} · {b.level}</div>
                </div>
                <span className="text-xs px-2 py-1 bg-primary-50 text-primary-700 rounded">{b.code}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText size={14} />
                <span>{b.unit_count || 0} / {b.total_units} 单元已录入</span>
              </div>
            </div>
          ))}
        </div>

        {/* 🎯 教材库管理 Modal — 直接增删改 textbooks 列表 */}
        {showBooksManage && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
              {/* header */}
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">⚙️ 管理教材列表</h2>
                  <p className="text-xs text-gray-500 mt-1">直接编辑 教材库 (新增教材/改元数据/删除教材). 改字段自动写库.</p>
                </div>
                <button
                  onClick={() => { setShowBooksManage(false); loadBooks(); }}
                  className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                >×</button>
              </div>

              {/* body — 教材表格 */}
              <div className="p-6">
                {booksManageLoading ? (
                  <div className="flex items-center gap-2 text-gray-500"><Loader size={14} className="animate-spin" /> 加载中...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2 mb-2">
                      <div className="col-span-2">code (唯一)</div>
                      <div className="col-span-4">教材名称</div>
                      <div className="col-span-2">level</div>
                      <div className="col-span-2">出版社</div>
                      <div className="col-span-1">单元数</div>
                      <div className="col-span-1">删</div>
                    </div>
                    <div className="space-y-1">
                      {manageBooks.map(b => (
                        <div key={b.code} className="grid grid-cols-12 gap-2 items-center px-2 py-1 border rounded text-sm">
                          <div className="col-span-2 text-xs text-gray-600 font-mono">{b.code}</div>
                          <input
                            type="text"
                            value={b.name}
                            onChange={(e) => updateManageBook(b.code, 'name', e.target.value)}
                            className="col-span-4 px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="text"
                            value={b.level || ''}
                            placeholder="Starter/L1..."
                            onChange={(e) => updateManageBook(b.code, 'level', e.target.value)}
                            className="col-span-2 px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="text"
                            value={b.publisher || ''}
                            onChange={(e) => updateManageBook(b.code, 'publisher', e.target.value)}
                            className="col-span-2 px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="number"
                            min={1} max={30}
                            value={b.total_units || 8}
                            onChange={(e) => updateManageBook(b.code, 'total_units', e.target.value)}
                            className="col-span-1 px-1 py-1 border rounded text-sm"
                          />
                          <button
                            onClick={() => deleteManageBook(b.code, b.name)}
                            className="col-span-1 text-red-500 hover:bg-red-100 px-1 rounded text-xs"
                            title="删除整本教材 (含全部 unit)"
                          >🗑</button>
                        </div>
                      ))}
                    </div>

                    {/* 新增教材 */}
                    <div className="mt-6 pt-4 border-t">
                      <div className="text-sm font-medium text-gray-700 mb-3">添加新教材</div>
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <input
                            type="text"
                            value={newBook.code}
                            onChange={(e) => setNewBook({ ...newBook, code: e.target.value })}
                            placeholder="code (如 EU-S)"
                            className="col-span-2 px-2 py-1 border rounded text-sm font-mono"
                          />
                          <input
                            type="text"
                            value={newBook.name}
                            onChange={(e) => setNewBook({ ...newBook, name: e.target.value })}
                            placeholder="教材全名"
                            className="col-span-4 px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="text"
                            value={newBook.level}
                            onChange={(e) => setNewBook({ ...newBook, level: e.target.value })}
                            placeholder="Starter/L1..."
                            className="col-span-2 px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="text"
                            value={newBook.publisher}
                            onChange={(e) => setNewBook({ ...newBook, publisher: e.target.value })}
                            placeholder="出版社"
                            className="col-span-2 px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="number"
                            min={1} max={30}
                            value={newBook.total_units}
                            onChange={(e) => setNewBook({ ...newBook, total_units: parseInt(e.target.value) || 8 })}
                            className="col-span-1 px-1 py-1 border rounded text-sm"
                          />
                        </div>
                        <input
                          type="text"
                          value={newBook.description}
                          onChange={(e) => setNewBook({ ...newBook, description: e.target.value })}
                          placeholder="教材描述 (可选)"
                          className="w-full px-2 py-1 border rounded text-sm"
                        />
                        <button
                          onClick={addManageBook}
                          className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >+ 新增教材</button>
                      </div>
                    </div>

                    <p className="mt-4 text-xs text-gray-500">
                      💡 提示: 新增教材后,这本书默认没有任何 unit. 进入新书 → 点右上角 <b>⚙️ 管理单元列表</b> 添加 unit.
                    </p>
                  </>
                )}
              </div>

              {/* footer */}
              <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between">
                <div className="text-xs text-gray-500">编辑自动保存 (改字段即写库). 删除教材前会二次确认.</div>
                <button
                  onClick={() => { setShowBooksManage(false); loadBooks(); }}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                >完成</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ====== 单本教材单元列表 ======
  if (selectedBook && !selectedUnit) {
    return (
      <div className="p-6 max-w-6xl">
        <button onClick={() => setSelectedBook(null)} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4 text-sm">
          <ArrowLeft size={16} /> 返回教材列表
        </button>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">{selectedBook.name}</h1>
            <div className="text-sm text-gray-500">{selectedBook.code} · {selectedBook.level} · {selectedBook.publisher}</div>
          </div>
          <button
            onClick={openUnitsManage}
            className="px-4 py-2 text-sm border-2 border-purple-400 text-purple-700 rounded-lg hover:bg-purple-50 font-medium"
          >
            ⚙️ 管理单元列表
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {selectedBook.units?.map(u => (
            <div key={u.unit_number} onClick={() => openUnit(u)} className={`border rounded-lg p-3 hover:shadow-md cursor-pointer ${u.has_content ? 'border-green-300 bg-green-50' : 'hover:border-primary-300'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-800">Unit {u.unit_number}</div>
                  <div className="text-sm text-gray-500 mt-1">{u.unit_title || '-'}</div>
                </div>
                {u.has_content ? (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded flex items-center gap-1"><CheckCircle size={12} />已录入</span>
                ) : (
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded">待录入</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 🎯 单元管理 Modal — 直接增删改 textbook_units 列表 */}
        {showUnitsManage && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
              {/* header */}
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">⚙️ 管理单元列表</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    直接编辑 {selectedBook.code} 的单元列表 (如改单元标题/编号/添加新单元/删除错的单元).
                    本教材是 <b>Everybody Up 第二版</b>? 此处按每级 8 个 Unit 的真实结构维护。
                  </p>
                </div>
                <button
                  onClick={() => { setShowUnitsManage(false); setManageUnits([]); openBook(selectedBook.code); }}
                  className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                >×</button>
              </div>

              {/* body */}
              <div className="p-6">
                {manageLoading ? (
                  <div className="flex items-center gap-2 text-gray-500"><Loader size={14} className="animate-spin" /> 加载中...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2 mb-2">
                      <div className="col-span-1">编号</div>
                      <div className="col-span-5">单元标题</div>
                      <div className="col-span-2">课时数</div>
                      <div className="col-span-2">启用</div>
                      <div className="col-span-1">内容</div>
                      <div className="col-span-1">删除</div>
                    </div>
                    <div className="space-y-1">
                      {manageUnits.map((u, idx) => (
                        <div key={u.id || idx} className="grid grid-cols-12 gap-2 items-center px-2 py-1 border rounded text-sm">
                          <input
                            type="number"
                            min={0} max={99}
                            value={u.unit_number}
                            onChange={(e) => updateManageUnit(idx, 'unit_number', parseInt(e.target.value) || 0)}
                            className="col-span-1 px-1 py-1 border rounded text-sm"
                          />
                          <input
                            type="text"
                            value={u.unit_title || ''}
                            placeholder="如:Hello!"
                            onChange={(e) => updateManageUnit(idx, 'unit_title', e.target.value)}
                            className="col-span-5 px-2 py-1 border rounded text-sm"
                          />
                          <input
                            type="number"
                            min={1} max={20}
                            value={u.lesson_count || 1}
                            onChange={(e) => updateManageUnit(idx, 'lesson_count', parseInt(e.target.value) || 1)}
                            className="col-span-2 px-1 py-1 border rounded text-sm"
                          />
                          <input
                            type="checkbox"
                            checked={u.is_active === 1 || u.is_active === true}
                            onChange={(e) => updateManageUnit(idx, 'is_active', e.target.checked)}
                            className="col-span-2 w-4 h-4"
                          />
                          <span className="col-span-1 text-xs text-gray-500 text-center">{u.content_count || 0}</span>
                          <button
                            onClick={() => deleteManageUnit(u.unit_number)}
                            className="col-span-1 text-red-500 hover:bg-red-100 px-1 rounded text-xs"
                            title="删除此单元"
                          >🗑</button>
                        </div>
                      ))}
                    </div>

                    {/* 新增单元 */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="text-sm font-medium text-gray-700 mb-2">添加新单元</div>
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="number"
                          min={0} max={99}
                          value={newUnitNum}
                          onChange={(e) => setNewUnitNum(e.target.value)}
                          placeholder="编号"
                          className="col-span-1 px-1 py-1 border rounded text-sm"
                        />
                        <input
                          type="text"
                          value={newUnitTitle}
                          onChange={(e) => setNewUnitTitle(e.target.value)}
                          placeholder="标题"
                          className="col-span-5 px-2 py-1 border rounded text-sm"
                        />
                        <div className="col-span-2 text-xs text-gray-400">1 (默认)</div>
                        <div className="col-span-2 text-xs text-gray-400">默认启用</div>
                        <button
                          onClick={addManageUnit}
                          className="col-span-2 px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >+ 添加</button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* footer */}
              <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between">
                <div className="text-xs text-gray-500">编辑自动保存 (改一个字段即写库). 删除前会确认.</div>
                <button
                  onClick={() => { setShowUnitsManage(false); setManageUnits([]); openBook(selectedBook.code); }}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                >完成</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ====== 单元详细: PDF 上传 + LLM 提取 + 校对 + 保存 ======
  return (
    <div className="p-6 max-w-5xl">
      <button onClick={() => setSelectedUnit(null)} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4 text-sm">
        <ArrowLeft size={16} /> 返回 {selectedBook.name}
      </button>
      <h1 className="text-2xl font-bold mb-1">{selectedBook.name} · Unit {selectedUnit.unit_number}</h1>
      <div className="text-gray-500 mb-6">{selectedUnit.unit_title}</div>

      {/* 已有内容 */}
      {unitContent && (
        <div className="border rounded-lg p-4 mb-6 bg-gray-50">
          <div className="font-medium text-gray-700 mb-2">📚 当前已保存内容</div>
          <ContentView data={unitContent} />
        </div>
      )}

      {/* PDF 上传 + 提取 (含单 unit + 整本书两种模式, 整本书支持分批) */}
      <div className="border-2 border-dashed rounded-lg p-6 mb-6">
        <div className="font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-purple-600" /> AI 提取
          <span className="text-xs text-gray-500 ml-2">
            模式: <span className="font-medium">{bookMode ? '📚 整本书 (自动分单元,分批处理)' : '📄 当前 Unit'}</span>
            <button onClick={() => { setBookMode(!bookMode); setBatchStart(0); setAccumulatedUnits([]); }} className="ml-2 text-primary-600 underline">
              切换到 {bookMode ? '单 unit' : '整本书'} 模式
            </button>
          </span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="file"
            accept=".pdf,image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="text-sm"
          />
          <button
            onClick={bookMode ? handleExtractBook : handleExtractPreview}
            disabled={extracting || rendering || renderedImages.length === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm flex items-center gap-2"
          >
            {extracting ? <Loader className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {extracting ? 'AI 识别中... (10-60 秒)' : bookMode ? `🤖 识别第 ${batchStart+1}-${batchStart + (renderedImages.length||BATCH_SIZE)} 页` : '🤖 AI 提取并保存'}
          </button>
          {/* 整本书模式: 已累积 unit 数 + 全部保存按钮 */}
          {bookMode && accumulatedUnits.length > 0 && (
            <button
              onClick={handleCommitAll}
              disabled={committing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
            >
              {committing ? <Loader className="animate-spin" size={16} /> : <CheckCircle size={16} />}
              {committing ? '保存中...' : `✅ 全部保存 ${accumulatedUnits.length} 个 unit 到数据库`}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-2">
          {bookMode
            ? `整本书模式: 每次处理 ${BATCH_SIZE} 页 → AI 识别 → 校对后点"确认这批"累积到列表 → 切下一批继续 → 全部完成后点"全部保存"一次性写入数据库`
            : '单 Unit 模式: 上传 PDF → 浏览器渲染每页 → AI 提取词汇/句型/语法 → 仅写入当前选定的 unit'}
        </p>
        {/* 整本书模式: 进度条 */}
        {bookMode && totalPages > 0 && (
          <div className="mb-2 text-xs text-gray-600">
            📖 进度: 第 {batchStart + 1}-{Math.min(batchStart + BATCH_SIZE, totalPages)} 页 / 共 {totalPages} 页
            <span className="ml-2">已完成 {accumulatedUnits.length} 个 unit 校对</span>
          </div>
        )}
        {/* 已累积的 unit 列表 (折叠显示) */}
        {bookMode && accumulatedUnits.length > 0 && (
          <div className="mt-3 p-3 bg-green-50 border rounded">
            <div className="font-medium text-sm text-green-700 mb-2">✅ 已校对的 {accumulatedUnits.length} 个 unit (待全部完成才写入库)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {accumulatedUnits.map((u, i) => (
                <div key={i} className="text-xs bg-white px-2 py-1 border rounded flex items-center justify-between">
                  <span>Unit {u.unit_number}: {u.unit_title || '?'} ({(u.vocab||[]).length} 词)</span>
                  <button onClick={() => removeAccumulatedUnit(i)} className="text-red-500 hover:bg-red-100 px-1 rounded">×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {renderError && <div className="mt-2 text-sm text-amber-600">⚠️ {renderError}</div>}
        {rendering && <div className="mt-2 text-sm text-gray-500 flex items-center gap-2"><Loader size={14} className="animate-spin" /> 正在把 PDF 转图片...</div>}
        {renderedImages.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 rounded grid grid-cols-2 sm:grid-cols-4 gap-2">
            {renderedImages.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.url} alt={`page ${i+1}`} className="w-full h-auto rounded border" style={{maxHeight: '120px', objectFit: 'contain', backgroundColor: '#fff'}} />
                <span className="text-xs text-gray-600 absolute top-1 left-1 bg-white/80 px-1 rounded">P{batchStart + i + 1}</span>
              </div>
            ))}
          </div>
        )}
        {extractError && <div className="mt-2 text-sm text-red-600">❌ {extractError}</div>}
      </div>

      {/* 提取结果预览 / 校对 */}
      {extractResult && (
        <div className="border rounded-lg p-4 mb-6 bg-amber-50 border-amber-200">
          <div className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-600" /> 提取结果 (已自动保存)
          </div>
          <ContentView data={extractResult} />
        </div>
      )}

      {/* R2 已上传的 PDF 列表 */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-gray-700 mb-3">📁 R2 中已上传的 PDF</h3>
        {pdfs.length === 0 ? (
          <div className="text-sm text-gray-400">还没有 PDF 文件</div>
        ) : (
          <ul className="space-y-1">
            {pdfs.map(p => (
              <li key={p.key} className="text-sm text-gray-600 flex items-center gap-2">
                <FileText size={14} />
                <a href={`https://api.changtian.dpdns.org/api/v1/textbooks/pdf/${encodeURIComponent(p.key)}`}
                   target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                  {p.key}
                </a>
                <span className="text-xs text-gray-400">({(p.size/1024).toFixed(1)} KB)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 🎯 校对 Modal — AI 识别完成后弹出,用户可编辑 unit_number/vocab/patterns/grammar */}
      {showReviewModal && previewUnits && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-auto">
            {/* Modal header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <CheckCircle size={20} className="text-amber-500" />
                  AI 识别结果校对
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  AI 识别出 {previewUnits.length} 个 unit。请检查以下内容,
                  可改 unit_number / 删错词 / 删整个 unit,
                  然后点 "确认保存" 才会写入数据库。
                </p>
              </div>
              <button
                onClick={() => { setShowReviewModal(false); setPreviewUnits(null); }}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >×</button>
            </div>

            {/* Modal body — 各 unit 校对区 */}
            <div className="p-6 space-y-4">
              {previewUnits.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  AI 没识别出任何 unit (可能是封面/目录页),请重新上传含词汇内容的 PDF 页
                </div>
              ) : (
                previewUnits.map((unit, idx) => (
                  <div key={idx} className="border rounded-lg p-4 bg-amber-50 border-amber-200">
                    {/* Unit header */}
                    <div className="flex items-center gap-3 mb-3">
                      <label className="text-sm font-medium text-gray-700">Unit #</label>
                      <input
                        type="number"
                        min={0} max={99}
                        value={unit.unit_number}
                        onChange={(e) => updateUnitField(idx, 'unit_number', parseInt(e.target.value) || 0)}
                        disabled={!bookMode}
                        className="w-16 px-2 py-1 border rounded text-sm disabled:bg-gray-100 disabled:text-gray-500"
                        title={bookMode ? '可改 unit 编号' : '单 Unit 模式下 unit 编号锁定'}
                      />
                      <label className="text-sm font-medium text-gray-700">Title</label>
                      <input
                        type="text"
                        value={unit.unit_title || ''}
                        onChange={(e) => updateUnitField(idx, 'unit_title', e.target.value)}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                      />
                      <button
                        onClick={() => removeUnit(idx)}
                        className="px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 flex items-center gap-1"
                      >
                        <Trash2 size={12} /> 删除此 unit
                      </button>
                    </div>

                    {/* Vocab */}
                    <div className="mb-2">
                      <div className="text-xs font-medium text-gray-700 mb-1">📚 词汇 ({(unit.vocab || []).length})</div>
                      <div className="space-y-1">
                        {(unit.vocab || []).map((v, vi) => (
                          <div key={vi} className="flex items-center gap-2 bg-white px-2 py-1 rounded text-sm">
                            <input
                              type="checkbox"
                              checked={v.is_core || false}
                              onChange={(e) => setPreviewUnits(prev => prev.map((u,i) => i===idx ? {...u, vocab: u.vocab.map((vv,j) => j===vi ? {...vv, is_core: e.target.checked} : vv)} : u))}
                              className="w-3 h-3"
                              title="核心词汇"
                            />
                            <input
                              type="text"
                              value={v.word}
                              onChange={(e) => setPreviewUnits(prev => prev.map((u,i) => i===idx ? {...u, vocab: u.vocab.map((vv,j) => j===vi ? {...vv, word: e.target.value} : vv)} : u))}
                              className="flex-1 px-1 py-0.5 border rounded text-sm"
                            />
                            <input
                              type="text"
                              value={v.translation || ''}
                              placeholder="翻译"
                              onChange={(e) => setPreviewUnits(prev => prev.map((u,i) => i===idx ? {...u, vocab: u.vocab.map((vv,j) => j===vi ? {...vv, translation: e.target.value} : vv)} : u))}
                              className="w-24 px-1 py-0.5 border rounded text-sm"
                            />
                            <button
                              onClick={() => removeVocab(idx, vi)}
                              className="text-red-500 hover:bg-red-100 px-1 rounded text-xs"
                            >×</button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Patterns */}
                    {(unit.patterns || []).length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs font-medium text-gray-700 mb-1">💬 句型 ({(unit.patterns || []).length})</div>
                        <div className="space-y-1">
                          {(unit.patterns || []).map((p, pi) => (
                            <div key={pi} className="flex items-center gap-2 bg-white px-2 py-1 rounded text-sm">
                              <input
                                type="text"
                                value={p.pattern}
                                onChange={(e) => setPreviewUnits(prev => prev.map((u,i) => i===idx ? {...u, patterns: u.patterns.map((pp,j) => j===pi ? {...pp, pattern: e.target.value} : pp)} : u))}
                                className="flex-1 px-1 py-0.5 border rounded text-sm"
                              />
                              <input
                                type="text"
                                value={p.translation || ''}
                                placeholder="翻译"
                                onChange={(e) => setPreviewUnits(prev => prev.map((u,i) => i===idx ? {...u, patterns: u.patterns.map((pp,j) => j===pi ? {...pp, translation: e.target.value} : pp)} : u))}
                                className="w-32 px-1 py-0.5 border rounded text-sm"
                              />
                              <button
                                onClick={() => removePattern(idx, pi)}
                                className="text-red-500 hover:bg-red-100 px-1 rounded text-xs"
                              >×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Grammar */}
                    {(unit.grammar || []).length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-1">📐 语法 ({(unit.grammar || []).length})</div>
                        <div className="space-y-1">
                          {(unit.grammar || []).map((g, gi) => (
                            <div key={gi} className="flex items-center gap-2 bg-white px-2 py-1 rounded text-sm">
                              <input
                                type="text"
                                value={g.point}
                                onChange={(e) => setPreviewUnits(prev => prev.map((u,i) => i===idx ? {...u, grammar: u.grammar.map((gg,j) => j===gi ? {...gg, point: e.target.value} : gg)} : u))}
                                className="flex-1 px-1 py-0.5 border rounded text-sm"
                              />
                              <input
                                type="text"
                                value={g.example || ''}
                                placeholder="例句"
                                onChange={(e) => setPreviewUnits(prev => prev.map((u,i) => i===idx ? {...u, grammar: u.grammar.map((gg,j) => j===gi ? {...gg, example: e.target.value} : gg)} : u))}
                                className="w-48 px-1 py-0.5 border rounded text-sm"
                              />
                              <button
                                onClick={() => removeGrammar(idx, gi)}
                                className="text-red-500 hover:bg-red-100 px-1 rounded text-xs"
                              >×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal footer */}
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-500">
                {bookMode
                  ? `本批 ${previewUnits.length} 个 unit (累积已完成 ${accumulatedUnits.length} 个)`
                  : `当前 Unit ${selectedUnit?.unit_number}: ${selectedUnit?.unit_title}`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowReviewModal(false); setPreviewUnits(null); }}
                  className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
                  disabled={committing}
                >取消 (丢弃本次结果)</button>
                {bookMode ? (
                  <>
                    {/* 整本书模式: 切下一批 + 全部保存双按钮 */}
                    <button
                      onClick={handleAppendBatch}
                      disabled={committing || previewUnits.length === 0}
                      className="px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <CheckCircle size={14} />
                      确认这批 + 切下一批 →
                    </button>
                    <button
                      onClick={handleCommitAll}
                      disabled={committing}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                    >
                      {committing ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      ✅ 全部保存到数据库 ({accumulatedUnits.length + (previewUnits?.length || 0)} 个)
                    </button>
                  </>
                ) : (
                  /* 单 Unit 模式: 直接保存到当前 unit */
                  <button
                    onClick={handleCommitAll}
                    disabled={committing || previewUnits.length === 0}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {committing ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    {committing ? '保存中...' : `✅ 保存到 Unit ${selectedUnit?.unit_number}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 子组件: 显示 vocab/patterns/grammar 内容
function ContentView({ data }) {
  const vocab = data.vocab || [];
  const patterns = data.patterns || [];
  const grammar = data.grammar || [];

  return (
    <div className="space-y-3 text-sm">
      {vocab.length > 0 && (
        <div>
          <div className="font-medium mb-1">📚 词汇 ({vocab.length})</div>
          <ul className="space-y-1">
            {vocab.map((v, i) => (
              <li key={i} className="flex items-center gap-2">
                {v.is_core && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">核心</span>}
                <span className="font-medium">{v.word}</span>
                {v.translation && <span className="text-gray-500">{v.translation}</span>}
                {v.difficulty && <span className="text-xs text-gray-400">D{v.difficulty}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {patterns.length > 0 && (
        <div>
          <div className="font-medium mb-1">💬 句型 ({patterns.length})</div>
          <ul className="space-y-1">
            {patterns.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                {p.is_core && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">核心</span>}
                <span className="font-medium">{p.pattern}</span>
                {p.translation && <span className="text-gray-500">{p.translation}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {grammar.length > 0 && (
        <div>
          <div className="font-medium mb-1">📐 语法 ({grammar.length})</div>
          <ul className="space-y-1">
            {grammar.map((g, i) => (
              <li key={i} className="flex items-center gap-2">
                {g.is_core && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">核心</span>}
                <span className="font-medium">{g.point}</span>
                {g.example && <span className="text-gray-500">→ {g.example}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {vocab.length === 0 && patterns.length === 0 && grammar.length === 0 && (
        <div className="text-gray-400">无内容</div>
      )}
    </div>
  );
}
