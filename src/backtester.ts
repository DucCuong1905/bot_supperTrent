import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

let isRunning = false;

export function stopBacktestExecution() {
  isRunning = false;
}

export interface SuperTrendBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tr: number;
  atr: number;
  supertrend: number;
  trend: number; // 1 = bullish, -1 = bearish
  signal: "BUY" | "SELL" | null;
}

// Bộ sinh nến vàng giả lập khi không tìm thấy file CSV vật lý (chống lỗi khởi động và test thử nghiệm)
export function generateSyntheticBars(startDateStr: string, endDateStr: string): number[][] {
  const klines: number[][] = [];
  const startTs = new Date(startDateStr).getTime();
  const endTs = new Date(endDateStr).getTime();
  const step = 60 * 1000; // 1 phút
  
  let price = 2000.0;
  let randomMemo = 42;
  const randNum = () => {
    randomMemo = (randomMemo * 1664525 + 1013904223) % 4294967296;
    return randomMemo / 4294967296;
  };

  const maxGenCount = 100000; // Bảo đảm an toàn bộ nhớ khi thời gian dài
  let count = 0;

  for (let ts = startTs; ts <= endTs; ts += step) {
    if (count++ > maxGenCount) break;
    const change = (randNum() - 0.495) * 1.5;
    const open = price;
    const close = parseFloat((price + change).toFixed(2));
    const noiseHigh = randNum() * 0.8;
    const noiseLow = randNum() * 0.8;
    const high = parseFloat((Math.max(open, close) + noiseHigh).toFixed(2));
    const low = parseFloat((Math.min(open, close) - noiseLow).toFixed(2));
    const vol = Math.floor(100 + randNum() * 1200);

    klines.push([ts, open, high, low, close, vol]);
    price = close;
  }
  return klines;
}

// Hàm tải dữ liệu cực kỳ thông minh hỗ trợ Mac, Windows, dữ liệu gộp từ thư mục
export function tryLoadFromXauCsv(startDate: string, endDate: string, timeframe: string): number[][] {
  let dataDir = path.join(process.cwd(), 'data');
  const customWindowsDir = 'C:\\xau_data';
  const customMacDir = '/Users/giapld/Documents/TL Học Tập/drive-download-20260609T101124Z-3-001';
  
  // Ưu tiên phát hiện thư mục của người dùng trên MacOS và Windows
  if (fs.existsSync(customMacDir)) {
      dataDir = customMacDir;
  } else if (fs.existsSync(customWindowsDir)) {
      dataDir = customWindowsDir;
  }
  
  if (!fs.existsSync(dataDir)) {
    console.log(`⚠️ Thư mục dữ liệu không tồn tại: ${dataDir}. Tự sinh dữ liệu ngẫu nhiên...`);
    return generateSyntheticBars(startDate, endDate);
  }
  
  const files = fs.readdirSync(dataDir);
  const csvFiles = files.filter(f => f.endsWith('.csv'));
  const jsonFile = files.find(f => f.endsWith('.json') && f.includes('1m'));

  let klines: any[] = [];
  if (jsonFile && csvFiles.length === 0) {
     try {
       console.log(`📡 Đang nạp dữ liệu từ tệp JSON: ${jsonFile}`);
       const text = fs.readFileSync(path.join(dataDir, jsonFile), 'utf8');
       klines = JSON.parse(text);
     } catch (e) {
       console.error("Error reading JSON data:", e);
     }
  } else if (csvFiles.length > 0) {
     try {
       console.log(`📡 Phát hiện ${csvFiles.length} tệp CSV. Đang tải và gộp dữ liệu...`);
       for (const csvFile of csvFiles) {
         const fullFilePath = path.join(dataDir, csvFile);
         console.log(`   + Tải: ${csvFile}`);
         const text = fs.readFileSync(fullFilePath, 'utf8');
         const lines = text.split('\n');
         
         // Bỏ dòng tiêu đề nếu có
         for (let i = 1; i < lines.length; i++) {
           const l = lines[i].trim();
           if (!l) continue;
           const parts = l.split(',');
           
           if (parts.length >= 5) {
             let ts = 0;
             let timeStr = "";
             let oIdx = 1, hIdx = 2, lIdx = 3, cIdx = 4, vIdx = 5;

             // Phát hiện cột Time riêng biệt (MT5 xuất: Date, Time, Open...)
             if (parts[1] && parts[1].includes(':') && isNaN(Number(parts[1]))) {
                 timeStr = `${parts[0].replace(/\./g, '-')}T${parts[1]}`;
                 if (timeStr.length === 16) timeStr += ':00';
                 timeStr += 'Z';
                 
                 oIdx = 2; hIdx = 3; lIdx = 4; cIdx = 5; vIdx = 6;
             } else {
                 timeStr = parts[0].replace(/\./g, '-');
             }
             
             if (!isNaN(Number(parts[0])) && parts[0].length >= 10 && !parts[0].includes('-') && !parts[0].includes('/')) {
                 ts = Number(parts[0]);
                 if (ts < 10000000000) ts *= 1000;
             } else {
                 ts = new Date(timeStr).getTime();
             }
             
             if (!isNaN(ts)) {
                 const openVal = parseFloat(parts[oIdx]);
                 const highVal = parseFloat(parts[hIdx]);
                 const lowVal = parseFloat(parts[lIdx]);
                 const closeVal = parseFloat(parts[cIdx]);
                 const volVal = parts[vIdx] ? parseFloat(parts[vIdx]) : 100;

                 if (!isNaN(openVal) && !isNaN(highVal) && !isNaN(lowVal) && !isNaN(closeVal)) {
                     klines.push([ts, openVal, highVal, lowVal, closeVal, volVal]);
                 }
             }
           }
         }
       }
       klines.sort((a,b) => a[0] - b[0]);
       console.log(`✅ Tổng số nến gộp thành công: ${klines.length}`);
     } catch(e) {
       console.error("Error reading CSV data:", e);
     }
  }

  if (klines.length === 0) {
    console.log(`⚠️ Không phân tích được nến nào từ thư mục. Tự sinh dữ liệu ngẫu nhiên...`);
    return generateSyntheticBars(startDate, endDate);
  }

  return klines;
}

// Hàm tính toán chỉ báo SuperTrend chuẩn hóa dạng chuỗi dữ liệu (tối ưu hóa O(N))
export function computeSuperTrendSeries(klines: number[][], period: number = 10, multiplier: number = 3.0): SuperTrendBar[] {
  const bars: SuperTrendBar[] = [];
  if (klines.length === 0) return [];

  const trs: number[] = [];
  for (let i = 0; i < klines.length; i++) {
    const [, , h, l, c] = klines[i];
    if (i === 0) {
      trs.push(h - l);
    } else {
      const prevC = klines[i - 1][4];
      trs.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
    }
  }

  const atrs: number[] = new Array(klines.length).fill(0);
  let trSum = 0;
  for (let i = 0; i < Math.min(period, klines.length); i++) {
    trSum += trs[i] || 0;
  }
  atrs[period - 1] = trSum / period;

  for (let i = period; i < klines.length; i++) {
    atrs[i] = (atrs[i - 1] * (period - 1) + trs[i]) / period;
  }

  let prevFinalUpper = 0;
  let prevFinalLower = 0;
  let prevTrend = 1;

  for (let i = 0; i < klines.length; i++) {
    const [ts, o, h, l, c, v] = klines[i];
    // Chống null index khi dữ liệu nhỏ hơn period
    const atr = atrs[i] || atrs[period - 1] || (h - l) || 1.0; 
    const tr = trs[i];

    const hl2 = (h + l) / 2;
    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    let finalUpper = basicUpper;
    let finalLower = basicLower;

    if (i > 0) {
      const prevC = klines[i - 1][4];
      finalUpper = (basicUpper < prevFinalUpper || prevC > prevFinalUpper) ? basicUpper : prevFinalUpper;
      finalLower = (basicLower > prevFinalLower || prevC < prevFinalLower) ? basicLower : prevFinalLower;
    }

    let trend = prevTrend;
    if (i > 0) {
      if (c > prevFinalUpper) {
        trend = 1;
      } else if (c < prevFinalLower) {
        trend = -1;
      } else {
        trend = prevTrend;
      }
    }

    const supertrendValue = trend === 1 ? finalLower : finalUpper;

    let signal: "BUY" | "SELL" | null = null;
    if (i > 0 && trend !== prevTrend) {
      signal = trend === 1 ? "BUY" : "SELL";
    }

    bars.push({
      time: ts,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
      tr,
      atr,
      supertrend: parseFloat(supertrendValue.toFixed(4)),
      trend,
      signal
    });

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
    prevTrend = trend;
  }

  return bars;
}

// Hàm tính toán chỉ báo ADX tối ưu hóa toàn bộ chuỗi nến O(N)
export function computeADXSeries(klines: number[][], period: number = 14): number[] {
  const adxArr = new Array(klines.length).fill(0);
  if (klines.length < period * 2) return adxArr;

  const trs: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const [, , h, l, c] = klines[i];
    const prevC = klines[i - 1][4];
    const prevH = klines[i - 1][2];
    const prevL = klines[i - 1][3];

    trs.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));

    const up = h - prevH;
    const down = prevL - l;

    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }

  const smoothedTR: number[] = [];
  const smoothedPlusDM: number[] = [];
  const smoothedMinusDM: number[] = [];

  let trSum = 0;
  let pDMSum = 0;
  let mDMSum = 0;

  for (let i = 0; i < period; i++) {
    trSum += trs[i] || 0;
    pDMSum += plusDM[i] || 0;
    mDMSum += minusDM[i] || 0;
  }

  smoothedTR[period - 1] = trSum;
  smoothedPlusDM[period - 1] = pDMSum;
  smoothedMinusDM[period - 1] = mDMSum;

  for (let i = period; i < trs.length; i++) {
    smoothedTR[i] = smoothedTR[i - 1] - (smoothedTR[i - 1] / period) + trs[i];
    smoothedPlusDM[i] = smoothedPlusDM[i - 1] - (smoothedPlusDM[i - 1] / period) + plusDM[i];
    smoothedMinusDM[i] = smoothedMinusDM[i - 1] - (smoothedMinusDM[i - 1] / period) + minusDM[i];
  }

  const dx: number[] = [];
  for (let i = period - 1; i < trs.length; i++) {
    const tr = smoothedTR[i];
    const plus = smoothedPlusDM[i];
    const minus = smoothedMinusDM[i];

    const plusDI = tr > 0 ? (100 * plus) / tr : 0;
    const minusDI = tr > 0 ? (100 * minus) / tr : 0;

    const sum = plusDI + minusDI;
    const diff = Math.abs(plusDI - minusDI);
    const dxValue = sum > 0 ? (100 * diff) / sum : 0;
    dx.push(dxValue);
  }

  let dxSum = 0;
  for (let i = 0; i < period; i++) {
    dxSum += dx[i] || 0;
  }
  let currentADX = dxSum / period;
  
  const startIdx = 2 * period - 1;
  if (startIdx < klines.length) {
    adxArr[startIdx] = currentADX;
  }

  for (let i = period; i < dx.length; i++) {
    const idx = startIdx + (i - period) + 1;
    if (idx < klines.length) {
      currentADX = (currentADX * (period - 1) + dx[i]) / period;
      adxArr[idx] = currentADX;
    }
  }

  return adxArr;
}

// Thực thi Backtest toàn diện dựa hoàn toàn vào chỉ báo SuperTrend
export async function runBacktest(
  startDate: string,
  endDate: string,
  rr: number,
  timeframe: string,
  enableSessionFilter: boolean,
  vwmaPeriod: number, // tham số giữ nguyên tương thích
  onProgress: (progress: number) => void,
  adxThreshold: number,
  verbose: boolean = false
) {
  isRunning = true;
  
  // Tải dữ liệu klines
  const rawData = (global as any).OPTIMIZE_DATA || tryLoadFromXauCsv(startDate, endDate, timeframe);
  if (!rawData || rawData.length === 0) {
    throw new Error('No data found for backtesting. Please upload data/xauusd.csv');
  }

  const startTs = new Date(startDate).getTime();
  const endTs = new Date(endDate).getTime();

  // Đọc tham số SuperTrend từ môi trường nếu có, nếu không thì dùng mặc định tốt nhất cho M1 (10, 3.0)
  const supertrendPeriod = parseInt(process.env.SUPERTREND_PERIOD || "10");
  const supertrendMultiplier = parseFloat(process.env.SUPERTREND_MULTIPLIER || "3.0");

  console.log(`📡 Đang tối ưu hóa tính toán chỉ báo SuperTrend (${supertrendPeriod}, ${supertrendMultiplier}) + ADX (14) cho ${rawData.length} nến...`);
  
  // Tính toán trước toàn bộ dãy chỉ báo trong 1 lượt O(N) siêu nhanh
  const st_bars = computeSuperTrendSeries(rawData, supertrendPeriod, supertrendMultiplier);
  const adxSeries = computeADXSeries(rawData, 14);

  let balance = 5000;
  let totalProfitR = 0;
  let totalTrades = 0;
  let wins = 0;
  
  let maxConsecutiveLosses = 0;
  let currentConsecutiveLosses = 0;
  
  let peakBalance = 5000;
  let maxDrawdownPercent = 0;
  let maxDrawdownValue = 0;
  
  let paperPosition: any = null;
  const monthlyStats = new Map<string, { trades: number, wins: number, profitR: number, pnlUSD: number }>();
  const tradeHistory: any[] = [];

  // Bắt đầu vòng lặp giả lập giao dịch
  for (let i = 20; i < st_bars.length; i++) {
    if (!isRunning) break;
    
    // Báo cáo tiến trình
    if (i % 12000 === 0) {
      const p = Math.floor((i / st_bars.length) * 100);
      onProgress(p);
    }
    
    const bar = st_bars[i];
    const cTs = bar.time;
    if (cTs < startTs || cTs > endTs) continue;

    // 1. QUẢN LÝ VỊ THẾ ĐANG MỞ (Exit & Trailing check)
    if (paperPosition) {
       let closed = false;
       let status: "WIN" | "LOSS" = "WIN";
       let exitPrice = bar.close;

       // Thực hiện cơ chế Trailing Stop Loss theo đường SuperTrend động của thị trường!
       if (paperPosition.type === "LONG") {
         if (bar.supertrend > paperPosition.sl) {
           paperPosition.sl = bar.supertrend; // Dời SL tiến lên theo band dưới SuperTrend
         }
       } else {
         if (bar.supertrend < paperPosition.sl) {
           paperPosition.sl = bar.supertrend; // Dời SL lùi xuống theo band trên SuperTrend
         }
       }

       // Kiểm tra giá chạm Stop Loss (SL) hoặc Take Profit (TP) trong nến
       if (paperPosition.type === "LONG") {
         if (bar.low <= paperPosition.sl) { 
           closed = true; 
           status = "LOSS"; 
           exitPrice = paperPosition.sl;
         } else if (bar.high >= paperPosition.tp) { 
           closed = true; 
           status = "WIN"; 
           exitPrice = paperPosition.tp;
         }
       } else {
         if (bar.high >= paperPosition.sl) { 
           closed = true; 
           status = "LOSS"; 
           exitPrice = paperPosition.sl;
         } else if (bar.low <= paperPosition.tp) { 
           closed = true; 
           status = "WIN"; 
           exitPrice = paperPosition.tp;
         }
       }

       // Đóng vị thế sớm khi chỉ báo đảo chiều xu hướng (Trend Reversal) trước khi chạm SL/TP
       if (!closed) {
          if (paperPosition.type === "LONG" && bar.trend === -1) {
             closed = true;
             exitPrice = bar.close;
             status = exitPrice >= paperPosition.entry ? "WIN" : "LOSS";
          } else if (paperPosition.type === "SHORT" && bar.trend === 1) {
             closed = true;
             exitPrice = bar.close;
             status = exitPrice <= paperPosition.entry ? "WIN" : "LOSS";
          }
       }

       // Xử lý thống kê và cập nhật tài khoản khi lệnh đóng
       if (closed) {
          totalTrades++;
          
          const d = new Date(cTs);
          const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          if (!monthlyStats.has(monthKey)) {
             monthlyStats.set(monthKey, { trades: 0, wins: 0, profitR: 0, pnlUSD: 0 });
          }
          const stat = monthlyStats.get(monthKey)!;
          stat.trades++;
          
          let pnlDollar = 0;
          if (status === "WIN") {
            wins++;
            totalProfitR += rr;
            stat.wins++;
            stat.profitR += rr;
            pnlDollar = paperPosition.riskUsd * rr;
            currentConsecutiveLosses = 0;
          } else {
            totalProfitR -= 1;
            stat.profitR -= 1;
            pnlDollar = -paperPosition.riskUsd;
            currentConsecutiveLosses++;
            if (currentConsecutiveLosses > maxConsecutiveLosses) {
              maxConsecutiveLosses = currentConsecutiveLosses;
            }
          }
          
          const balanceBefore = balance;
          balance = parseFloat((balance + pnlDollar).toFixed(2));
          stat.pnlUSD += pnlDollar;
          
          // Cập nhật Max Drawdown
          if (balance > peakBalance) {
            peakBalance = balance;
          } else {
            const currentDrawdownValue = peakBalance - balance;
            const currentDrawdownPercent = (currentDrawdownValue / peakBalance) * 100;
            if (currentDrawdownPercent > maxDrawdownPercent) {
              maxDrawdownPercent = currentDrawdownPercent;
            }
            if (currentDrawdownValue > maxDrawdownValue) {
              maxDrawdownValue = currentDrawdownValue;
            }
          }
          
          const tradeData = {
            id: paperPosition.id,
            type: paperPosition.type,
            entryPrice: paperPosition.entry,
            exitPrice: parseFloat(exitPrice.toFixed(4)),
            time: new Date(cTs).toISOString(),
            status: status,
            reason: status === "WIN" ? "TP" : "SL",
            pnl: parseFloat(pnlDollar.toFixed(2)),
            balanceBefore,
            balanceAfter: balance
          };
          tradeHistory.push(tradeData);

          if (verbose) {
            const timeStr = new Date(cTs).toISOString().replace("T", " ").substring(0, 19);
            console.log(`[TRADE] ${timeStr} | ${paperPosition.type} | ${status} | PnL: ${status === "WIN" ? `+${rr}R` : `-1R`} | PnL $: ${pnlDollar > 0 ? '+' : ''}${pnlDollar.toFixed(2)}$ | B: ${balance.toFixed(2)}$`);
          }

          paperPosition = null;
       }
       continue; // Đảm bảo cooldown 1 nến sau khi đóng lệnh mới tìm cơ hội khác
    }

    // 2. TÌM KIẾM CƠ HỘI VÀO LỆNH (LONG / SHORT signals on closed bar i-1)
    const prevBar = st_bars[i - 1];
    const sig = prevBar.signal; // "BUY" hoặc "SELL" được kích hoạt khi nến vừa đóng hoàn toàn

    if (sig) {
      // Bộ lọc giờ giao dịch (Session Filter - Giữ an toàn vốn, đặc biệt giao dịch Vàng M1)
      const date = new Date(cTs);
      const hoursGMT = date.getUTCHours();
      const SESSION_START_GMT = 8;
      const SESSION_END_GMT = 21;
      let isInSession = true;
      if (enableSessionFilter) {
         isInSession = hoursGMT >= SESSION_START_GMT && hoursGMT < SESSION_END_GMT;
      }

      // Bộ lọc ADX để lọc nhiễu sideway (Nếu có kích hoạt adxThreshold > 0)
      const adxVal = adxSeries[i - 1] || 0;
      const satisfiesADX = adxThreshold <= 0 || adxVal >= adxThreshold;

      if (isInSession && satisfiesADX) {
        const e = bar.open; // Vào lệnh tại giá mở cửa của nến hiện tại (ngay khi chỉ báo nến trước chốt)
        let sl = prevBar.supertrend; // SL đặt ngay tại giá trị đường SuperTrend của nến tín hiệu
        
        // Quản lý an toàn khoảng Stop Loss (Enforce minimum risk based on ATR)
        const minRisk = prevBar.atr * 1.5;
        if (sig === "BUY") {
          if (e - sl < minRisk) {
            sl = e - minRisk;
          }
          const riskDistance = e - sl;
          const tp = e + riskDistance * rr;

          // Thiết lập mức quản lý rủi ro trên tài khoản (default: 1% balance)
          const riskUsdStr = process.env.MT5_RISK_USD;
          let tradeRiskUsd = balance * 0.01;
          if (riskUsdStr) {
             const parsedRisk = parseFloat(riskUsdStr);
             if (!isNaN(parsedRisk) && parsedRisk > 0) {
                 tradeRiskUsd = parsedRisk;
             }
          }

          paperPosition = {
            id: `T-${sig}-${i}`,
            type: "LONG",
            entry: e,
            sl: parseFloat(sl.toFixed(4)),
            tp: parseFloat(tp.toFixed(4)),
            riskUsd: tradeRiskUsd
          };
        } else if (sig === "SELL") {
          if (sl - e < minRisk) {
            sl = e + minRisk;
          }
          const riskDistance = sl - e;
          const tp = e - riskDistance * rr;

          const riskUsdStr = process.env.MT5_RISK_USD;
          let tradeRiskUsd = balance * 0.01;
          if (riskUsdStr) {
             const parsedRisk = parseFloat(riskUsdStr);
             if (!isNaN(parsedRisk) && parsedRisk > 0) {
                 tradeRiskUsd = parsedRisk;
             }
          }

          paperPosition = {
            id: `T-${sig}-${i}`,
            type: "SHORT",
            entry: e,
            sl: parseFloat(sl.toFixed(4)),
            tp: parseFloat(tp.toFixed(4)),
            riskUsd: tradeRiskUsd
          };
        }
      }
    }
  }

  const monthlySnapshots = Array.from(monthlyStats.entries()).map(([month, stat]) => ({
    date: month,
    whaleTrades: stat.trades,
    whaleWins: stat.wins,
    whalePnLR: stat.profitR,
    pnl: parseFloat(stat.pnlUSD.toFixed(2))
  }));
  
  monthlySnapshots.sort((a, b) => a.date.localeCompare(b.date));

  const results = {
    startTime: startDate,
    endTime: endDate,
    finalBalance: parseFloat(balance.toFixed(2)),
    totalProfitR: parseFloat(totalProfitR.toFixed(2)),
    totalTrades: totalTrades,
    wins: wins,
    losses: totalTrades - wins,
    maxConsecutiveLosses,
    maxDrawdownPercent: parseFloat(maxDrawdownPercent.toFixed(2)),
    maxDrawdownValue: parseFloat(maxDrawdownValue.toFixed(2)),
    monthlySnapshots
  };

  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(path.join(dataDir, 'trades.json'), JSON.stringify(tradeHistory, null, 2));
    fs.writeFileSync(path.join(dataDir, 'backtest_results.json'), JSON.stringify(results, null, 2));
  } catch (e) {}
  
  return results;
}
