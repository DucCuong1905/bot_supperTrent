import { useState, useEffect } from "react";
import { 
  Play, 
  Settings, 
  Terminal, 
  Cpu, 
  FileCode, 
  BookOpen, 
  Copy, 
  Check, 
  TrendingUp, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownRight, 
  FileText, 
  HelpCircle,
  Activity,
  User,
  Lock,
  Database,
  ExternalLink,
  DollarSign
} from "lucide-react";

interface SupertrendBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tr: number;
  atr: number;
  upperBand: number;
  lowerBand: number;
  supertrend: number;
  trend: 1 | -1;
  signal: "BUY" | "SELL" | null;
}

interface Trade {
  id: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  size: number;
  profit: number;
  status: "CLOSED" | "OPEN";
}

interface BacktestResults {
  trades: Trade[];
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  profitTrades: number;
  lossTrades: number;
}

export default function App() {
  const [mt5Login, setMt5Login] = useState("123456");
  const [mt5Password, setMt5Password] = useState("MySecurePassword");
  const [mt5Server, setMt5Server] = useState("MetaQuotes-Demo");
  const [symbol, setSymbol] = useState("XAUUSD");
  const [atrPeriod, setAtrPeriod] = useState(10);
  const [atrMultiplier, setAtrMultiplier] = useState(3.0);
  const [lotSize, setLotSize] = useState(0.01);
  const [takeProfit, setTakeProfit] = useState(1500); // 1500 points = $15 movement
  const [stopLoss, setStopLoss] = useState(1000);   // 1000 points = $10 movement
  const [trailingStop, setTrailingStop] = useState(true);
  const [pm2Name, setPm2Name] = useState("gold-supertrend-bot");

  // Chart configuration
  const [seed, setSeed] = useState(42);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [bars, setBars] = useState<SupertrendBar[]>([]);
  const [backtest, setBacktest] = useState<BacktestResults | null>(null);

  // Exporter data
  const [generatedFiles, setGeneratedFiles] = useState<{
    botPy: string;
    ecosystemJs: string;
    requirementsTxt: string;
    readmeMd: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"bot" | "pm2" | "req" | "readme">("bot");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // AI advisory state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string>("");

  // Live gold ticker simulator to give an immersive active desk feel
  const [goldPrice, setGoldPrice] = useState(2645.50);
  const [priceChange, setPriceChange] = useState(1.25);
  const [activeLogs, setActiveLogs] = useState<Array<{time: string; text: string; type: "info" | "success" | "warn" | "error"}>>([]);

  useEffect(() => {
    // Run backtest initially
    handleRunBacktest();
    
    // Push initial status logs
    pushLog("Hệ thống quản trị bot Vàng M1 đã sẵn sàng.", "info");
    pushLog("Đã nạp file cấu hình đề xuất cho XAUUSD.", "info");

    const timer = setInterval(() => {
      setGoldPrice(prev => {
        const delta = (Math.random() - 0.49) * 0.4;
        const nextPrice = parseFloat((prev + delta).toFixed(2));
        const changePercent = parseFloat(((nextPrice - 2640.0) / 2640.0 * 100).toFixed(2));
        setPriceChange(changePercent);
        return nextPrice;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const pushLog = (text: string, type: "info" | "success" | "warn" | "error" = "info") => {
    const timeStr = new Date().toLocaleTimeString("vi-VN", { hour12: false });
    setActiveLogs(prev => [{ time: timeStr, text, type }, ...prev.slice(0, 49)]);
  };

  const handleRunBacktest = async () => {
    setLoadingBacktest(true);
    pushLog(`Đang gửi yêu cầu sinh dữ liệu & chạy Backtest định cấu hình: TP ${takeProfit}, SL ${stopLoss}...`, "info");
    try {
      const res = await fetch("/api/historical-candles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atrPeriod,
          atrMultiplier,
          lotSize,
          takeProfit,
          stopLoss,
          seed
        })
      });
      const data = await res.json();
      if (data.success) {
        setBars(data.bars);
        setBacktest(data.backtest);
        pushLog(`Chạy Backtest hoàn tất. Tổng số giao dịch đóng: ${data.backtest.totalTrades} | Win rate: ${data.backtest.winRate}%`, "success");
        
        // Also trigger file generator automatically to sync codes on setting changes
        handleGenerateFiles();
      } else {
        pushLog(`Lỗi chạy backtest: ${data.error}`, "error");
      }
    } catch (e: any) {
      pushLog(`Không thể kết nối đến máy chủ backtester.`, "error");
    } finally {
      setLoadingBacktest(false);
    }
  };

  const handleGenerateFiles = async () => {
    try {
      const res = await fetch("/api/generate-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mt5Login,
          mt5Password,
          mt5Server,
          symbol,
          atrPeriod,
          atrMultiplier,
          lotSize,
          takeProfit,
          stopLoss,
          trailingStop,
          pm2Name
        })
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedFiles(data.files);
      }
    } catch (e) {
      console.error("Failed to generate files", e);
    }
  };

  const triggerGeminiOptimize = async () => {
    setAiLoading(true);
    setAiAdvice("");
    pushLog("Đang kết nối trí tuệ nhân tạo Gemini để phân tích rủi ro & tối ưu tham số...", "info");
    try {
      const res = await fetch("/api/gemini-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPeriod: atrPeriod,
          currentMultiplier: atrMultiplier,
          symbol,
          riskPercent: (lotSize * 100).toFixed(2)
        })
      });
      const data = await res.json();
      setAiAdvice(data.advice || "Không nhận được phản hồi phù hợp.");
      pushLog("Đã nhận khuyến nghị thông số từ Gemini AI.", "success");
    } catch (e: any) {
      setAiAdvice("Lỗi kết nối API phân tích thông số.");
      pushLog("Lỗi khi gửi phân tích AI.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(label);
    pushLog(`Đã sao chép nội dung file: ${label}`, "success");
    setTimeout(() => setCopiedFile(null), 3000);
  };

  // Helper values for rendering SVG Chart
  // We'll render the last 40 bars for a highly detailed zoomed view that looks gorgeous!
  const displayBarsCount = 42;
  const recentBars = bars.slice(-displayBarsCount);

  // Find min/max prices to scale SVG properly
  const valuesY = recentBars.flatMap(b => [b.high, b.low, b.supertrend]);
  const minY = Math.min(...(valuesY.length ? valuesY : [2600]));
  const maxY = Math.max(...(valuesY.length ? valuesY : [2700]));
  const paddingY = (maxY - minY) * 0.1 || 5;
  const scaleYMin = minY - paddingY;
  const scaleYMax = maxY + paddingY;

  return (
    <div id="gold-dashboard" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-amber-500/35 selection:text-amber-200">
      
      {/* Premium Navigation Header */}
      <header id="header-bar" className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-amber-600 to-yellow-400 rounded-lg shadow-lg shadow-amber-500/20 text-slate-950">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">XAUUSD SuperTrend Bot</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Bridge MT5 & PM2
              </span>
            </div>
            <p className="text-xs text-slate-400">Hệ thống đồng bộ chiến lược giao dịch tự động 1 phút (M1)</p>
          </div>
        </div>

        {/* Live quote & Status metrics */}
        <div className="flex items-center gap-6 text-sm flex-wrap justify-center sm:justify-end">
          <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-1.5 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-xs text-slate-400 font-medium">GIÁ VÀNG MÔ PHỎNG (BID)</span>
            <span className="font-mono text-amber-400 font-bold tracking-wider">${goldPrice.toFixed(2)}</span>
            <span className={`text-xs flex items-center font-bold ${priceChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {priceChange >= 0 ? "+" : ""}{priceChange}%
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 bg-slate-800/40 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300">
            <Activity className="w-4 h-4 text-slate-400" />
            <span>PM2 Watcher:</span>
            <span className="text-white font-bold bg-indigo-500/20 px-1.5 py-0.5 rounded text-[10px]">AUTO-RESTART</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main id="main-workspace" className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 p-6">
        
        {/* Left Interactive Sidepanel: Configuration form (4 Columns) */}
        <section id="bot-config-section" className="xl:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-slate-100 text-base">Cấu hình tham số bot</h2>
              </div>
              <button 
                id="btn-run-backtest"
                onClick={handleRunBacktest}
                disabled={loadingBacktest}
                className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 text-xs font-bold rounded-lg transition-all duration-150 flex items-center gap-1.5 disabled:opacity-50 active:scale-95 shadow-lg shadow-amber-500/10 cursor-pointer"
              >
                {loadingBacktest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Chạy kiểm thử
              </button>
            </div>

            {/* Config Sub-sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
              
              {/* Account / MT5 Connector info */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold text-amber-400/80 tracking-wider uppercase">Cổng MetaTrader 5 Bridge</h3>
                
                <div className="flex flex-col gap-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] text-slate-400 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" /> Tài khoản MT5 (Login)
                    </label>
                    <input 
                      type="text"
                      value={mt5Login}
                      onChange={e => {setMt5Login(e.target.value); handleGenerateFiles();}}
                      className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                      placeholder="e.g. 1029348"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 mt-1">
                    <label className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-500" /> Mật khẩu giao dịch
                    </label>
                    <input 
                      type="password"
                      value={mt5Password}
                      onChange={e => {setMt5Password(e.target.value); handleGenerateFiles();}}
                      className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                      placeholder="Password"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 mt-1">
                    <label className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Database className="w-3 h-3 text-slate-500" /> Server MT5 Broker
                    </label>
                    <input 
                      type="text"
                      value={mt5Server}
                      onChange={e => {setMt5Server(e.target.value); handleGenerateFiles();}}
                      className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                      placeholder="e.g. Exness-Trial2"
                    />
                  </div>
                </div>
              </div>

              {/* SuperTrend Algorithm configuration parameters */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold text-amber-400/80 tracking-wider uppercase">Thuật toán SuperTrend (M1)</h3>
                
                <div className="flex flex-col gap-2.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-400 flex items-center gap-1">
                        ATR Period <HelpCircle className="w-2.5 h-2.5 text-slate-500" title="Chu kỳ tính toán chỉ báo Standard ATR" />
                      </label>
                      <input 
                        type="number" 
                        value={atrPeriod}
                        onChange={e => setAtrPeriod(Math.max(1, parseInt(e.target.value) || 10))}
                        className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-400">Multiplier</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={atrMultiplier}
                        onChange={e => setAtrMultiplier(Math.max(0.1, parseFloat(e.target.value) || 3.0))}
                        className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-400">Mã giao dịch</label>
                      <input 
                        type="text" 
                        value={symbol}
                        onChange={e => {setSymbol(e.target.value); handleGenerateFiles();}}
                        className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-yellow-400 font-bold focus:outline-none focus:border-amber-500 uppercase"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-400">Khối lượng (Lót)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={lotSize}
                        onChange={e => setLotSize(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                        className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Risk parameters & Safeguards */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold text-amber-400/80 tracking-wider uppercase">Chốt lời & Cắt lỗ (Points)</h3>
                
                <div className="flex flex-col gap-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-400">Chốt lời (TP Points)</label>
                      <input 
                        type="number" 
                        value={takeProfit}
                        step="100"
                        onChange={e => setTakeProfit(Math.max(0, parseInt(e.target.value) || 0))}
                        className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-emerald-400 font-mono focus:outline-none focus:border-emerald-500"
                        placeholder="0 = off"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-400">Cắt lỗ (SL Points)</label>
                      <input 
                        type="number" 
                        value={stopLoss}
                        step="100"
                        onChange={e => setStopLoss(Math.max(0, parseInt(e.target.value) || 0))}
                        className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-rose-400 font-mono focus:outline-none focus:border-rose-500"
                        placeholder="0 = off"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-tight">
                    * Với Vàng: 100 points tương đương $1.00 USD biến động tỷ giá. SL nên đặt hợp lý chống rung lắc.
                  </p>

                  <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 mt-1">
                    <span className="text-[11px] text-slate-300 font-medium">Bám sát sóng (Trailing Stop)</span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={trailingStop} 
                        onChange={e => {setTrailingStop(e.target.checked); handleGenerateFiles();}}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* PM2 & System Deploy settings */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold text-amber-400/80 tracking-wider uppercase">Tên tiến trình PM2</h3>
                
                <div className="flex flex-col gap-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-slate-400">Định danh PM2 app</label>
                    <input 
                      type="text" 
                      value={pm2Name}
                      onChange={e => {setPm2Name(e.target.value.toLowerCase().replace(/\s+/g, '-')); handleGenerateFiles();}}
                      className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    PM2 sẽ sử dụng định danh này để theo dõi logs và tự động hồi sinh khi có sự cố mạng.
                  </p>
                </div>
              </div>

            </div>

            {/* Backtest Trigger */}
            <div className="border-t border-slate-800/80 pt-4 mt-1 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Bộ đếm nhiễu (Seed ngẫu nhiên):</span>
                <input 
                  type="number" 
                  value={seed}
                  onChange={e => setSeed(parseInt(e.target.value) || 42)}
                  className="w-16 bg-slate-950 border border-slate-800 rounded text-center py-0.5 text-xs text-amber-400 font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Chiến lược SuperTrend sẽ tính toán đường biên tối ưu từ nguồn dữ liệu nến M1 được kiến tạo với chu kỳ ngẫu nhiên nhằm đảm bảo bot hoạt động chuẩn xác ngay cả khi biến động mạnh.
              </p>
            </div>
          </div>

          {/* Activity Status Feed Logging */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 flex-1 min-h-[160px] max-h-[300px]">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Terminal className="w-4.5 h-4.5 text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-200">Terminal Hoạt Động (Logs)</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto font-mono text-[10px] flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {activeLogs.map((log, index) => {
                let colorClass = "text-slate-400";
                if (log.type === "success") colorClass = "text-emerald-400";
                if (log.type === "warn") colorClass = "text-amber-400";
                if (log.type === "error") colorClass = "text-rose-400";
                return (
                  <div key={index} className="flex gap-2 hover:bg-slate-800/20 py-0.5 px-1 rounded transition-colors">
                    <span className="text-slate-600 shrink-0">[{log.time}]</span>
                    <span className={`${colorClass} break-all`}>{log.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Middle and Right: Multi-Views & Output panels (8 Columns) */}
        <section id="bot-main-workspace" className="xl:col-span-8 flex flex-col gap-6">

          {/* Chart & Live Simulation Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg p-5 flex flex-col gap-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                <div>
                  <h3 className="font-bold text-sm text-slate-200">Biểu đồ Kỹ thuật Vàng M1 & Đường SuperTrend</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Hiển thị {displayBarsCount} nến gần nhất với tín hiệu Bán/Mua tự động</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800/50">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded bg-emerald-500 inline-block"></span> Tăng (BULL)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded bg-rose-500 inline-block"></span> Giảm (BEAR)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4.5 bg-amber-400 inline-block"></span> SuperTrend Line
                </span>
              </div>
            </div>

            {/* Simulated Live Advanced SVG Candle Chart (TradingView Lookalike) */}
            <div className="relative bg-slate-950 p-4 rounded-xl border border-slate-800 min-h-[300px] flex flex-col justify-between overflow-hidden">
              {loadingBacktest ? (
                <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 z-20">
                  <RefreshCw className="w-10 h-10 text-amber-500 animate-spin" />
                  <p className="text-xs text-slate-400">Đang tính dựng dải chỉ báo SuperTrend...</p>
                </div>
              ) : recentBars.length === 0 ? (
                <div className="absolute inset-0 bg-slate-950 flex items-center justify-center text-xs text-slate-500">
                  Không có dữ liệu nến. Bấm "Chạy kiểm thử" để nạp biểu đồ.
                </div>
              ) : null}

              {/* The SVG Canvas */}
              {recentBars.length > 0 && (
                <div className="flex-1 w-full h-[260px] relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 260" preserveAspectRatio="none">
                    
                    {/* SVG Grid Lines */}
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map((ratio, idx) => (
                      <line 
                        key={idx}
                        x1="0" 
                        y1={260 * ratio} 
                        x2="1000" 
                        y2={260 * ratio} 
                        stroke="#1e293b" 
                        strokeWidth="0.5" 
                        strokeDasharray="4 4"
                      />
                    ))}

                    {/* Vertical grid lines */}
                    {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x, idx) => (
                      <line 
                        key={idx}
                        x1={x} 
                        y1="0" 
                        x2={x} 
                        y2="260" 
                        stroke="#1e293b" 
                        strokeWidth="0.5" 
                        strokeDasharray="4 4"
                      />
                    ))}

                    {/* Paint Candles, trend lines, and Signals */}
                    {recentBars.map((bar, idx) => {
                      // X calculation
                      const strokeSpacing = 1000 / displayBarsCount;
                      const x = idx * strokeSpacing + strokeSpacing / 2;
                      const candleWidth = strokeSpacing * 0.7;

                      // Price mapping helper
                      const getY = (val: number) => {
                        return 260 - ((val - scaleYMin) / (scaleYMax - scaleYMin)) * 260;
                      };

                      const openY = getY(bar.open);
                      const closeY = getY(bar.close);
                      const highY = getY(bar.high);
                      const lowY = getY(bar.low);
                      const isBullish = bar.close >= bar.open;

                      // Fill color for candle body
                      const color = isBullish ? "#10b981" : "#f43f5e";

                      // Supertrend line mapping
                      const supertrendY = getY(bar.supertrend);
                      let prevSupertrendY = supertrendY;
                      if (idx > 0) {
                        prevSupertrendY = getY(recentBars[idx - 1].supertrend);
                      }

                      return (
                        <g key={idx}>
                          {/* Candle Wick (Line) */}
                          <line 
                            x1={x} 
                            y1={highY} 
                            x2={x} 
                            y2={lowY} 
                            stroke={color} 
                            strokeWidth="1.5" 
                          />

                          {/* Candle Body (Rect) */}
                          <rect 
                            x={x - candleWidth / 2} 
                            y={Math.min(openY, closeY)} 
                            width={candleWidth} 
                            height={Math.max(1.5, Math.abs(openY - closeY))} 
                            fill={color} 
                            rx="1"
                          />

                          {/* SuperTrend Line Connectors */}
                          {idx > 0 && (
                            <line 
                              x1={x - strokeSpacing} 
                              y1={prevSupertrendY} 
                              x2={x} 
                              y2={supertrendY} 
                              stroke={bar.trend === 1 ? "#10b981" : "#ef4444"} 
                              strokeWidth="2.5" 
                              strokeLinecap="round"
                            />
                          )}

                          {/* Signals arrows (BUY is green up triangle, SELL is red down triangle) */}
                          {bar.signal === "BUY" && (
                            <g>
                              {/* Glowing signal background for emphasis */}
                              <circle cx={x} cy={lowY + 18} r="10" fill="#10b981" fillOpacity="0.15" />
                              <polygon 
                                points={`${x},${lowY + 12} ${x - 5},${lowY + 22} ${x + 5},${lowY + 22}`} 
                                fill="#10b981" 
                              />
                              <text x={x} y={lowY + 31} fill="#10b981" fontSize="8" fontWeight="bold" textAnchor="middle">BUY</text>
                            </g>
                          )}

                          {bar.signal === "SELL" && (
                            <g>
                              <circle cx={x} cy={highY - 18} r="10" fill="#f43f5e" fillOpacity="0.15" />
                              <polygon 
                                points={`${x},${highY - 12} ${x - 5},${highY - 22} ${x + 5},${highY - 22}`} 
                                fill="#f43f5e" 
                              />
                              <text x={x} y={highY - 27} fill="#f43f5e" fontSize="8" fontWeight="bold" textAnchor="middle">SELL</text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}

              {/* Price axis labels */}
              {recentBars.length > 0 && (
                <div className="absolute right-2 top-2 bg-slate-900/90 py-1.5 px-2.5 rounded border border-slate-800 text-[10px] font-mono flex flex-col gap-1 z-10 pointer-events-none">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Gợi ý Max Y:</span>
                    <span className="text-slate-200 font-bold">${scaleYMax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Gợi ý Min Y:</span>
                    <span className="text-slate-200 font-bold">${scaleYMin.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-850 my-0.5"></div>
                  <div className="flex justify-between gap-4 items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                    <span className="text-amber-400 font-bold">XAUUSD</span>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-center text-slate-500 italic mt-1 font-mono">
                * Trình hiển thị nến gold 1 phút mô phỏng dao động thực tế theo chu kỳ sinh số tự nhiên.
              </p>
            </div>

            {/* Backtest Statistics Panel */}
            {backtest && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex flex-col">
                  <span className="text-[11px] text-slate-400 uppercase font-medium">Tỷ lệ thắng (Win Rate)</span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-bold font-mono text-amber-400">{backtest.winRate}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${backtest.winRate}%` }}></div>
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] text-slate-400 uppercase font-medium">Mô phỏng PnL ($)</span>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className={`text-2xl font-bold font-mono ${backtest.totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {backtest.totalPnL >= 0 ? "+" : ""}${backtest.totalPnL}
                    </span>
                    <span className="text-[10px] text-slate-500">USD</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
                    {backtest.totalPnL >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-400 animate-bounce" /> : null}
                    Quy mô {lotSize} Lot Standard XAUUSD
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] text-slate-400 uppercase font-medium">Tổng lệnh đóng</span>
                  <span className="text-2xl font-bold font-mono text-slate-200 mt-1">{backtest.totalTrades} Lệnh</span>
                  <div className="text-[10px] text-slate-500 mt-2.5">
                    Khung thời gian khảo sát: ~3 giờ qua
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] text-slate-400 uppercase font-medium">Lãi / Lỗ cụ thể</span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded border border-emerald-500/20 font-mono">
                      {backtest.profitTrades} Win
                    </span>
                    <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-xs rounded border border-rose-500/20 font-mono">
                      {backtest.lossTrades} Loss
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-3 leading-none">
                    Dựa trên TP={takeProfit} và SL={stopLoss} points
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Gemini AI Consultation / Advice Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Cpu className="w-5 h-5 text-amber-400" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                </div>
                <h3 className="font-bold text-sm text-slate-200">Trí Tuệ Nhân Tạo Gemini - Tham vấn tham số Gold M1</h3>
              </div>
              <button 
                id="btn-ai-optimize"
                onClick={triggerGeminiOptimize}
                disabled={aiLoading}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-slate-100 text-xs font-bold rounded-lg transition-all duration-150 flex items-center gap-1.5 disabled:opacity-50 active:scale-95 shadow-lg shadow-indigo-500/10 cursor-pointer"
              >
                {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
                Tối ưu hóa tối cấp bằng AI
              </button>
            </div>

            {aiAdvice ? (
              <div className="bg-slate-950 p-4 rounded-xl border border-indigo-900/40 text-xs leading-relaxed text-slate-300 overflow-y-auto max-h-[250px] scrollbar-thin">
                <div className="prose prose-invert prose-xs max-w-none">
                  {aiAdvice.split("\n").map((line, index) => {
                    if (line.startsWith("###")) {
                      return <h4 key={index} className="text-amber-400 font-bold text-sm mt-3 mb-1.5">{line.replace("###", "").trim()}</h4>;
                    }
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return <strong key={index} className="block text-slate-200 font-bold mt-1.5">{line.replaceAll("**", "").trim()}</strong>;
                    }
                    if (line.startsWith("-")) {
                      return <div key={index} className="pl-4 py-0.5 text-slate-300 relative before:content-['•'] before:absolute before:left-1.5 before:text-amber-500">{line.substring(1).trim()}</div>;
                    }
                    return <p key={index} className="mb-2 leading-relaxed">{line}</p>;
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center py-6 gap-2">
                <p className="text-xs text-slate-400 max-w-lg">
                  Hãy nhấn nút **Tối ưu hóa tối cấp bằng AI** để gửi bộ tham số SuperTrend hiện hành lên mô hình ngôn ngữ lớn **Gemini**. Trợ lý sẽ phân tích xu hướng biến động, độ lớn spread, đề xuất lọc nhiễu dải EMA, khuyến nghị chặn đầu đuôi TP/SL.
                </p>
                <span className="text-[10px] text-slate-500">Sử dụng trực tiếp qua hệ sinh thái AI Studio Cloud Run</span>
              </div>
            )}
          </div>

          {/* Export Code Section & PM2 Setup Guideline */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg p-5 flex flex-col gap-4">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-3 gap-3">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-sm text-slate-200">Trình đóng gói & Cấp xuất mã nguồn</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Mã nguồn đồng bộ theo dữ liệu nhập chuẩn để cấu hình PM2 nhanh</p>
                </div>
              </div>

              {/* Selector tabs */}
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1 overflow-x-auto">
                <button 
                  onClick={() => setActiveTab("bot")}
                  className={`px-3 py-1 text-xs rounded font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeTab === "bot" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  bot.py
                </button>
                <button 
                  onClick={() => setActiveTab("pm2")}
                  className={`px-3 py-1 text-xs rounded font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeTab === "pm2" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  ecosystem.config.js
                </button>
                <button 
                  onClick={() => setActiveTab("req")}
                  className={`px-3 py-1 text-xs rounded font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeTab === "req" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  requirements.txt
                </button>
                <button 
                  onClick={() => setActiveTab("readme")}
                  className={`px-3 py-1 text-xs rounded font-medium transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeTab === "readme" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  HƯỚNG DẪN TRIỂN KHAI
                </button>
              </div>
            </div>

            {/* Render selected file */}
            {generatedFiles ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between bg-slate-950 py-2.5 px-4 rounded-t-lg border-x border-t border-slate-800">
                  <span className="text-[11px] font-mono text-slate-400">
                    {activeTab === "bot" && "Cổng nạp dữ liệu: bot.py (Python MT5)"}
                    {activeTab === "pm2" && "Tiến trình đồng hành: ecosystem.config.js (PM2)"}
                    {activeTab === "req" && "Thư viện phụ trợ: requirements.txt"}
                    {activeTab === "readme" && "Cẩm nang cài đặt chi tiết trên Windows Server"}
                  </span>
                  
                  {/* Action values */}
                  <button 
                    onClick={() => {
                      let text = "";
                      if (activeTab === "bot") text = generatedFiles.botPy;
                      if (activeTab === "pm2") text = generatedFiles.ecosystemJs;
                      if (activeTab === "req") text = generatedFiles.requirementsTxt;
                      if (activeTab === "readme") text = generatedFiles.readmeMd;
                      handleCopyText(text, activeTab);
                    }}
                    className="px-3 py-1 bg-slate-900 border border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 rounded text-xs text-amber-400 flex items-center gap-1.5 transition-all text-[11px] font-bold cursor-pointer active:scale-95"
                  >
                    {copiedFile === activeTab ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Đã sao chép!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Sao chép code
                      </>
                    )}
                  </button>
                </div>

                {/* Display Area */}
                <div className="relative bg-slate-950 p-4 rounded-b-lg border-x border-b border-slate-800 text-xs font-mono overflow-auto max-h-[350px] scrollbar-thin scrollbar-thumb-slate-800 text-slate-300 leading-relaxed">
                  {activeTab === "bot" && (
                    <pre className="whitespace-pre">{generatedFiles.botPy}</pre>
                  )}
                  {activeTab === "pm2" && (
                    <pre className="whitespace-pre">{generatedFiles.ecosystemJs}</pre>
                  )}
                  {activeTab === "req" && (
                    <pre className="whitespace-pre">{generatedFiles.requirementsTxt}</pre>
                  )}
                  {activeTab === "readme" && (
                    <div className="prose prose-invert prose-xs max-w-none font-sans">
                      {generatedFiles.readmeMd.split("\n").map((line, lidx) => {
                        if (line.startsWith("# ")) {
                          return <h2 key={lidx} className="text-amber-400 font-bold text-lg mt-4 mb-2 first:mt-0">{line.replace("#", "").trim()}</h2>;
                        }
                        if (line.startsWith("## ")) {
                          return <h3 key={lidx} className="text-slate-100 font-bold text-base mt-4 mb-2">{line.replace("##", "").trim()}</h3>;
                        }
                        if (line.startsWith("### ")) {
                          return <h4 key={lidx} className="text-yellow-400 font-bold text-sm mt-3 mb-1.5">{line.replace("###", "").trim()}</h4>;
                        }
                        if (line.startsWith("* **") || line.startsWith("* ")) {
                          return (
                            <div key={lidx} className="pl-4 py-0.5 text-slate-300 relative before:content-['•'] before:absolute before:left-1.0 before:text-amber-500">
                              {line.substring(1).trim()}
                            </div>
                          );
                        }
                        if (line.startsWith("`")) {
                          return <code key={lidx} className="block bg-slate-900 border border-slate-800 rounded p-2 my-2 font-mono text-amber-300">{line.replaceAll("`", "")}</code>;
                        }
                        return <p key={lidx} className="mb-2 text-slate-300">{line}</p>;
                      })}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="text-center py-10 text-slate-500 text-xs">
                Đang đóng gói file tự động...
              </div>
            )}
          </div>

        </section>

      </main>

      {/* Footer */}
      <footer id="footer-credits" className="bg-slate-950 border-t border-slate-900 px-6 py-4 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 gap-2">
        <p>© 2026 XAUUSD SuperTrend Automation Bot System.</p>
        <p className="flex items-center gap-1">
          Hệ sinh thái tự động hóa sản phẩm Vàng 1 phút (M1) được đóng gói cho Python và MetaTrader 5 (Windows).
        </p>
      </footer>
    </div>
  );
}

