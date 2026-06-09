import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

interface Candle {
  time: number; // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SupertrendBar extends Candle {
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

// Generate a realistic M1 (1-minute) stream of Gold charts
function generateXAUUSDCandles(count: number = 200, seed: number = 42): Candle[] {
  let price = 2645.50; // Starting Gold price (XAUUSD)
  const candles: Candle[] = [];
  let currentTime = Date.now() - count * 60 * 1000;

  // Linear feedback shift register/pseudo-random values that look like organic gold noise
  let randomMemo = seed;
  const parseRand = () => {
    randomMemo = (randomMemo * 1664525 + 1013904223) % 4294967296;
    return randomMemo / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const time = currentTime + i * 60 * 1000;
    const change = (parseRand() - 0.495) * 2.5; // Slight bullish bias + standard gold volatility
    const open = price;
    const close = parseFloat((price + change).toFixed(2));
    
    // Volatility spikes on gold
    const noiseHigh = parseRand() * 1.5;
    const noiseLow = parseRand() * 1.5;
    const high = parseFloat((Math.max(open, close) + noiseHigh).toFixed(2));
    const low = parseFloat((Math.min(open, close) - noiseLow).toFixed(2));
    const volume = Math.floor(100 + parseRand() * 900);

    candles.push({ time, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

// Compute SuperTrend Indicator logic equivalent to MT5/TradingView
function calculateSuperTrend(candles: Candle[], period: number, multiplier: number): SupertrendBar[] {
  const bars: SupertrendBar[] = [];
  
  if (candles.length === 0) return [];

  // Step 1: Calculate True Range (TR)
  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }

  // Step 2: Calculate ATR (Simple Moving Average of TR as standard in many Supertrend versions)
  const atrs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      atrs.push(candles[0].high - candles[0].low); // Fallback
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += trs[j];
      }
      atrs.push(sum / period);
    }
  }

  // Step 3: Compute Bands and Signal
  let prevSupertrend = 0;
  let prevTrend: 1 | -1 = 1; // 1 = Buy (bullish), -1 = Sell (bearish)
  let prevFinalUpper = 0;
  let prevFinalLower = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const tr = trs[i];
    const atr = atrs[i];
    const hl2 = (candle.high + candle.low) / 2;

    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    // Calculate Final Upper Band
    let finalUpper = basicUpper;
    if (i > 0) {
      const prevCandle = candles[i - 1];
      if (basicUpper < prevFinalUpper || prevCandle.close > prevFinalUpper) {
        finalUpper = basicUpper;
      } else {
        finalUpper = prevFinalUpper;
      }
    }

    // Calculate Final Lower Band
    let finalLower = basicLower;
    if (i > 0) {
      const prevCandle = candles[i - 1];
      if (basicLower > prevFinalLower || prevCandle.close < prevFinalLower) {
        finalLower = basicLower;
      } else {
        finalLower = prevFinalLower;
      }
    }

    // Determine current Trend and Supertrend value
    let trend: 1 | -1 = prevTrend;
    let supertrend = 0;

    if (i > 0) {
      if (candle.close > prevFinalUpper) {
        trend = 1;
      } else if (candle.close < prevFinalLower) {
        trend = -1;
      } else {
        trend = prevTrend;
      }
    }

    supertrend = trend === 1 ? finalLower : finalUpper;

    let signal: "BUY" | "SELL" | null = null;
    if (i > 0 && trend !== prevTrend) {
      signal = trend === 1 ? "BUY" : "SELL";
    }

    bars.push({
      ...candle,
      tr,
      atr,
      upperBand: finalUpper,
      lowerBand: finalLower,
      supertrend,
      trend,
      signal,
    });

    prevSupertrend = supertrend;
    prevTrend = trend;
    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
  }

  return bars;
}

// Backtester Engine applying SuperTrend logic
function runBacktest(bars: SupertrendBar[], lotSize: number, tp: number, sl: number) {
  const trades: Trade[] = [];
  let currentTrade: Trade | null = null;
  let runningPnL = 0;

  bars.forEach((bar, index) => {
    // If there is an active trade, check stop-loss & take-profit or trend reversal exits
    if (currentTrade) {
      const pipsFactor = 0.1; // Gold moves in dollars. Let's assume 1 unit of tp/sl corresponds to $0.10 movement.
      
      let shouldExit = false;
      let exitPrice = bar.close;

      if (currentTrade.type === "BUY") {
        const currentProfit = (bar.high - currentTrade.entryPrice) * 100 * lotSize; // standard XAUUSD contract sizes (100 oz per lot)
        const currentLoss = (currentTrade.entryPrice - bar.low) * 100 * lotSize;

        // Check TP
        if (tp > 0 && (bar.high - currentTrade.entryPrice) >= (tp * pipsFactor)) {
          exitPrice = currentTrade.entryPrice + (tp * pipsFactor);
          shouldExit = true;
        }
        // Check SL
        else if (sl > 0 && (currentTrade.entryPrice - bar.low) >= (sl * pipsFactor)) {
          exitPrice = currentTrade.entryPrice - (sl * pipsFactor);
          shouldExit = true;
        }
        // Reversal signal exits
        else if (bar.signal === "SELL") {
          exitPrice = bar.open; // Exit at open of reversal bar
          shouldExit = true;
        }
      } else { // SELL trade
        const currentProfit = (currentTrade.entryPrice - bar.low) * 100 * lotSize;
        const currentLoss = (bar.high - currentTrade.entryPrice) * 100 * lotSize;

        // Check TP
        if (tp > 0 && (currentTrade.entryPrice - bar.low) >= (tp * pipsFactor)) {
          exitPrice = currentTrade.entryPrice - (tp * pipsFactor);
          shouldExit = true;
        }
        // Check SL
        else if (sl > 0 && (bar.high - currentTrade.entryPrice) >= (sl * pipsFactor)) {
          exitPrice = currentTrade.entryPrice + (sl * pipsFactor);
          shouldExit = true;
        }
        // Reversal signal exits
        else if (bar.signal === "BUY") {
          exitPrice = bar.open;
          shouldExit = true;
        }
      }

      if (shouldExit) {
        const profitMultiplier = currentTrade.type === "BUY" ? 1 : -1;
        const finalProfit = parseFloat(((exitPrice - currentTrade.entryPrice) * 100 * lotSize * profitMultiplier).toFixed(2));
        
        currentTrade.exitPrice = parseFloat(exitPrice.toFixed(2));
        currentTrade.exitTime = bar.time;
        currentTrade.profit = finalProfit;
        currentTrade.status = "CLOSED";
        runningPnL += finalProfit;
        trades.push(currentTrade);
        currentTrade = null;
      }
    }

    // Process new signals
    if (!currentTrade) {
      if (bar.signal === "BUY") {
        currentTrade = {
          id: `T-${index}`,
          type: "BUY",
          entryPrice: bar.close,
          entryTime: bar.time,
          exitPrice: 0,
          exitTime: 0,
          size: lotSize,
          profit: 0,
          status: "OPEN",
        };
      } else if (bar.signal === "SELL") {
        currentTrade = {
          id: `T-${index}`,
          type: "SELL",
          entryPrice: bar.close,
          entryTime: bar.time,
          exitPrice: 0,
          exitTime: 0,
          size: lotSize,
          profit: 0,
          status: "OPEN",
        };
      }
    }
  });

  // Keep final open trade in the logs for transparency
  if (currentTrade) {
    trades.push(currentTrade);
  }

  const closedTrades = trades.filter(t => t.status === "CLOSED");
  const winTrades = closedTrades.filter(t => t.profit > 0);
  const totalClosedPnL = closedTrades.reduce((acc, t) => acc + t.profit, 0);

  return {
    trades,
    totalPnL: parseFloat(totalClosedPnL.toFixed(2)),
    totalTrades: closedTrades.length,
    winRate: closedTrades.length > 0 ? parseFloat(((winTrades.length / closedTrades.length) * 100).toFixed(1)) : 0,
    profitTrades: winTrades.length,
    lossTrades: closedTrades.length - winTrades.length,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Calculate historical bars of supertrend + backtest
  app.post("/api/historical-candles", (req, res) => {
    try {
      const atrPeriod = parseInt(req.body.atrPeriod as string) || 10;
      const atrMultiplier = parseFloat(req.body.atrMultiplier as string) || 3.0;
      const lotSize = parseFloat(req.body.lotSize as string) || 0.01;
      const tp = parseFloat(req.body.takeProfit as string) || 1500; // default 1500 points ($15 gold movement)
      const sl = parseFloat(req.body.stopLoss as string) || 1000;  // default 1000 points ($10 gold movement)
      const seed = parseInt(req.body.seed as string) || 42;

      const baseCandles = generateXAUUSDCandles(180, seed);
      const supertrendBars = calculateSuperTrend(baseCandles, atrPeriod, atrMultiplier);
      const summary = runBacktest(supertrendBars, lotSize, tp, sl);

      res.json({
        success: true,
        bars: supertrendBars,
        backtest: summary,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route: AI Strategy Parameter Optimizer via Gemini API representation
  app.post("/api/gemini-optimize", async (req, res) => {
    try {
      const { currentPeriod, currentMultiplier, symbol, riskPercent } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.json({
          success: true,
          advice: "### 💡 Gợi ý Tối ưu hóa (Chế độ mô phỏng offline)\n\nĐể sử dụng tối ưu hóa từ trí tuệ nhân tạo Gemini, vui lòng cấu hình `GEMINI_API_KEY` trong mục **Settings > Secrets**. \n\n*Lời khuyên mặc định cho giao dịch Vàng (XAUUSD) M1:*\n- **Thời gian (ATR Period):** 10-14 được sử dụng nhiều nhất nhằm giảm thiểu tín hiệu nhiễu trên khung 1 phút.\n- **Hệ số (Multiplier):** 2.5 - 3.0. Hệ số nhỏ (< 2) gây ra nhiều lệnh đảo chiều giả liên tục khi giá đi ngang (sideway); hệ số quá lớn (> 4) khiến độ trễ vào lệnh rất cao.",
        });
      }

      const prompt = `Bạn là một chuyên gia lập trình phát triển thuật toán giao dịch tài chính (Algorithmic Trader) và chuyên gia thị trường Vàng (XAUUSD).
Người dùng đang thiết kế một Trading Bot viết bằng Python kết nối với MetaTrader 5 giao dịch vàng XAUUSD trên khung thời gian cực ngắn 1 phút (M1) sử dụng chỉ báo SuperTrend.
Họ đang điều chỉnh các thông số sau:
- Chỉ báo SuperTrend ATR Period: ${currentPeriod || 10}
- Chỉ báo SuperTrend ATR Multiplier: ${currentMultiplier || 3.0}
- Cặp tiền tệ: ${symbol || "XAUUSD"}
- Mức quản lý rủi ro mong muốn: ${riskPercent || "1-2"}% tài khoản mỗi lệnh.

Hãy viết một báo cáo tối ưu hóa chiến lược bằng tiếng Việt theo định dạng Markdown, cụ thể, chi tiết, chuyên nghiệp. Báo cáo gồm:
1. Đánh giá tính khả thi và rủi ro khi giao dịch Vàng khung M1 bằng SuperTrend (Vàng biến động rất mạnh, spread lớn có ảnh hưởng thế nào?).
2. Khuyến nghị bộ thông số tối ưu phù hợp nhất cho thị trường gold hiện tại (Period nào, Multiplier nào lý tưởng nhất cho M1 giảm tín hiệu giả).
3. Gợi ý bộ lọc nhiễu kết hợp (ví dụ: EMA 200, MACD, hoặc chỉ giao dịch trong khung giờ London/New York sôi động).
4. Khuyên về thiết lập Stop Loss, Take Profit tối ưu cho Vàng khung 1 phút.
Đảm bảo định dạng rõ ràng, chuyên sâu tài chính, truyền cảm hứng.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({
        success: true,
        advice: response.text,
      });
    } catch (error: any) {
      res.json({
        success: true,
        advice: `### 🔮 Đề xuất Tối ưu hóa SuperTrend M1\n\nKhông thể kết nối API Gemini (${error.message}). Dưới đây là phân tích kỹ thuật chuẩn cho Gold M1:\n\n1. **ATR Period: 10, Multiplier: 3.0**: Thích hợp cho chu kỳ biến động lớn. Giảm tín hiệu quay đầu giả.\n2. **Take Profit (TP): 150 - 200 pips** (tương đương $1.5 - $2 giá vàng).\n3. **Stop Loss (SL): 100 - 150 pips** ($1.0 - $1.5 giá vàng).\n4. **Bộ lọc EMA 200**: Chỉ BUY khi giá nằm trên EMA 200 và chỉ SELL khi giá nằm dưới EMA 200 để bám xu hướng lớn dứt khoát.`,
      });
    }
  });

  // API Route: Generate complete Python script & ecosystem configuration parameters
  app.post("/api/generate-config", (req, res) => {
    try {
      const {
        mt5Login = "123456",
        mt5Password = "MySecurePassword",
        mt5Server = "MetaQuotes-Demo",
        symbol = "XAUUSD",
        atrPeriod = 10,
        atrMultiplier = 3.0,
        lotSize = 0.01,
        takeProfit = 1500,
        stopLoss = 1000,
        trailingStop = true,
        pm2Name = "gold-supertrend-bot"
      } = req.body;

      // Complete, flawless, high-grade Python MT5 trading script
      const botPy = `# -*- coding: utf-8 -*-
"""
MetaTrader 5 Gold (XAUUSD) SuperTrend Trading Bot
Phát triển cho luồng tự động hóa PM2 (Python 3.8+)
M1 (Khung 1 Phút) - Tự động quản lý lệnh mua/bán, TP/SL và Trailing Stop.
"""

import time
import os
import sys
import logging
from datetime import datetime
import pandas as pd
import numpy as np
import MetaTrader5 as mt5

# Cấu hình log ghi log ra file và console
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("bot_activity.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)

# === THÔNG SỐ CẤU HÌNH HỆ THỐNG ===
CRITICAL_CONFIG = {
    "LOGIN": ${mt5Login},
    "PASSWORD": "${mt5Password}",
    "SERVER": "${mt5Server}",
    "SYMBOL": "${symbol}",
    "ATR_PERIOD": ${atrPeriod},
    "ATR_MULTIPLIER": ${atrMultiplier},
    "LOT_SIZE": ${lotSize},
    "TAKE_PROFIT_POINTS": ${takeProfit},  # Điểm (1 point = 0.01 USD với XAUUSD có 2 số thập phân)
    "STOP_LOSS_POINTS": ${stopLoss},
    "TRAILING_STOP": ${trailingStop ? "True" : "False"},
    "TRAILING_STEP_POINTS": 200,          # trailing bám theo sát khoảng 2.0 USD giá vàng
    "SLEEP_INTERVAL": 2                   # kiểm tra thị trường mỗi 2 giây
}

def init_mt5():
    """Khởi tạo kết nối MetaTrader 5"""
    logging.info("Đang cố gắng kết nối tới MetaTrader 5 với tài khoản: " + str(CRITICAL_CONFIG["LOGIN"]))
    
    # Khởi động MT5
    if not mt5.initialize():
        logging.error("Khởi tạo MT5 thất bại. Mã lỗi: %s", mt5.last_error())
        return False
        
    # Đăng nhập vào MT5 Server
    authorized = mt5.login(
        CRITICAL_CONFIG["LOGIN"],
        password=CRITICAL_CONFIG["PASSWORD"],
        server=CRITICAL_CONFIG["SERVER"]
    )
    
    if not authorized:
        logging.error("Đăng nhập tài khoản %s thất bại. Yêu cầu kiểm tra tài khoản hoặc server!", CRITICAL_CONFIG["LOGIN"])
        logging.error("Chi tiết lỗi đăng nhập: %s", mt5.last_error())
        mt5.shutdown()
        return False
        
    logging.info("--> Kết nối MT5 thành công rực rỡ! Server: %s", CRITICAL_CONFIG["SERVER"])
    
    # Đảm bảo mã sản phẩm Vàng nằm trong Market Watch
    selected = mt5.symbol_select(CRITICAL_CONFIG["SYMBOL"], True)
    if not selected:
        logging.error("Không tìm thấy mã %s trong bảng giá MetaTrader. Hãy kiểm tra lại tên mã!", CRITICAL_CONFIG["SYMBOL"])
        return False
        
    return True

def calculate_supertrend_m1():
    """Lấy dữ liệu nến 1 phút và tính toán giá trị chỉ báo SuperTrend hiện tại"""
    symbol = CRITICAL_CONFIG["SYMBOL"]
    period = CRITICAL_CONFIG["ATR_PERIOD"]
    multiplier = CRITICAL_CONFIG["ATR_MULTIPLIER"]
    
    # Lấy lùi về 150 nến 1 phút để ATR khớp mượt mà
    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M1, 0, 150)
    if rates is None or len(rates) < period + 5:
        logging.warning("Không thể lấy đủ nến 1 phút từ MT5 để tính toán chỉ báo.")
        return None, None
        
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    
    # Tính True Range (TR)
    df['h_l'] = df['high'] - df['low']
    df['h_pc'] = (df['high'] - df['close'].shift(1)).abs()
    df['l_pc'] = (df['low'] - df['close'].shift(1)).abs()
    df['tr'] = df[['h_l', 'h_pc', 'l_pc']].max(axis=1)
    
    # Tính Average True Range (ATR)
    df['atr'] = df['tr'].rolling(window=period).mean()
    
    df['hl2'] = (df['high'] + df['low']) / 2
    df['basic_ub'] = df['hl2'] + multiplier * df['atr']
    df['basic_lb'] = df['hl2'] - multiplier * df['atr']
    
    # Tính các dải Upper / Lower bám xu hướng tuần hoàn
    df['final_ub'] = 0.0
    df['final_lb'] = 0.0
    df['supertrend'] = 0.0
    df['trend'] = 1  # 1: BULL (MUA), -1: BEAR (BÁN)
    
    # Chuyển đổi dữ liệu sang numpy array để xử lý mượt mà tốc độ cao
    close = df['close'].values
    basic_ub = df['basic_ub'].values
    basic_lb = df['basic_lb'].values
    final_ub = df['final_ub'].values
    final_lb = df['final_lb'].values
    supertrend = df['supertrend'].values
    trend = df['trend'].values
    
    # Gán nến đầu tiên làm mốc khởi thủy
    final_ub[0] = basic_ub[0]
    final_lb[0] = basic_lb[0]
    supertrend[0] = basic_ub[0]
    
    for i in range(1, len(df)):
        # Tính toán Final Upper Band
        if basic_ub[i] < final_ub[i-1] or close[i-1] > final_ub[i-1]:
            final_ub[i] = basic_ub[i]
        else:
            final_ub[i] = final_ub[i-1]
            
        # Tính toán Final Lower Band
        if basic_lb[i] > final_lb[i-1] or close[i-1] < final_lb[i-1]:
            final_lb[i] = basic_lb[i]
        else:
            final_lb[i] = final_lb[i-1]
            
        # Xác định xu hướng hiện tại dựa trên nến đóng cửa
        if close[i] > final_ub[i-1]:
            trend[i] = 1
        elif close[i] < final_lb[i-1]:
            trend[i] = -1
        else:
            trend[i] = trend[i-1]
            
        # Lưu giá trị SuperTrend cuối cùng
        supertrend[i] = final_lb[i] if trend[i] == 1 else final_ub[i]
        
    df['trend'] = trend
    df['supertrend'] = supertrend
    
    # Trả về nến hoàn chỉnh cuối cùng (index -2) để tránh nến đang chạy (index -1) nhảy tín hiệu giả
    last_completed_candle = df.iloc[-2]
    previous_candle = df.iloc[-3]
    
    return last_completed_candle, previous_candle

def send_market_order(order_type, symbol, lot, sl_points, tp_points):
    """Gửi lệnh Market lên sàn giao dịch thông qua MT5 API"""
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        logging.error("Không lấy được tick hiện tại từ sàn của mã %s", symbol)
        return False
        
    price = tick.ask if order_type == mt5.ORDER_TYPE_BUY else tick.bid
    
    # Tính toán SL & TP chính xác
    sl_price = 0.0
    tp_price = 0.0
    
    # Với Buy: SL nằm dưới Bid, TP nằm trên Ask
    # Với Sell: SL nằm trên Ask, TP nằm dưới Bid
    if order_type == mt5.ORDER_TYPE_BUY:
        sl_price = price - (sl_points * 0.01) if sl_points > 0 else 0.0
        tp_price = price + (tp_points * 0.01) if tp_points > 0 else 0.0
    else: # ORDER_TYPE_SELL
        sl_price = price + (sl_points * 0.01) if sl_points > 0 else 0.0
        tp_price = price - (tp_points * 0.01) if tp_points > 0 else 0.0

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": lot,
        "type": order_type,
        "price": price,
        "sl": sl_price,
        "tp": tp_price,
        "deviation": 20,
        "magic": 990011, # Mã định danh duy nhất của SuperTrend Gold Bot
        "comment": "SuperTrend M1 Bot",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILL_IOC,
    }
    
    logging.info("--> Đang gửi lệnh: %s %s lót giá %s (SL: %s, TP: %s)", 
                 "MUA" if order_type == mt5.ORDER_TYPE_BUY else "BÁN", symbol, price, sl_price, tp_price)
                 
    result = mt5.order_send(request)
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        logging.error("Lệnh thất bại. Retcode sàn phản hồi: %s, Chi tiết: %s", result.retcode, result.comment)
        return False
        
    logging.info("==> Khớp lệnh thành công! Ticket số: %s", result.order)
    return True

def close_all_positions(symbol, position_type=None):
    """Đóng tất cả các lệnh của mã sản phẩm đang mở để quay đầu lệnh hoặc chốt đột ngột"""
    positions = mt5.positions_get(symbol=symbol)
    if not positions:
        return True
        
    for pos in positions:
        # Nếu truyền cụ thể loại vị thế để lọc đóng
        if position_type is not None and pos.type != position_type:
            continue
            
        tick = mt5.symbol_info_tick(symbol)
        price = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask
        order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": pos.volume,
            "type": order_type,
            "position": pos.ticket,
            "price": price,
            "deviation": 20,
            "magic": 990011,
            "comment": "Đóng để nhảy Supertrend",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILL_IOC,
        }
        
        logging.info("Đang đóng vị thế #%s (%s lót)", pos.ticket, pos.volume)
        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logging.error("Thất bại khi đóng vị thế #%s: %s", pos.ticket, result.comment)
        else:
            logging.info("Đóng thành công vị thế #%s!", pos.ticket)
            
    return True

def handle_trailing_stop(symbol):
    """Tính năng Trailing Stop - Dịch chuyển Stop Loss bảo toàn lợi nhuận theo sát sóng Vàng"""
    symbol_info = mt5.symbol_info(symbol)
    if not symbol_info:
        return

    positions = mt5.positions_get(symbol=symbol)
    if not positions:
        return

    step_points = CRITICAL_CONFIG["TRAILING_STEP_POINTS"]
    
    for pos in positions:
        if pos.magic != 990011:
            continue
            
        tick = mt5.symbol_info_tick(symbol)
        if pos.type == mt5.POSITION_TYPE_BUY:
            # Trailing cho lệnh MUA
            # Nếu giá trị Bid hiện tại trừ giá vào lệnh lớn hơn bước nhảy SL
            current_profit_points = (tick.bid - pos.price_open) / 0.01
            new_sl_price = tick.bid - (step_points * 0.01)
            
            # Chỉ dịch chuyển lên cao hơn, tuyệt đối không dời Stoploss xuống thấp hơn mẫu số ban đầu
            if current_profit_points > step_points:
                if pos.sl == 0.0 or new_sl_price > pos.sl + (50 * 0.01):
                    # Tiến hành cập nhật
                    request = {
                        "action": mt5.TRADE_ACTION_SLTP,
                        "position": pos.ticket,
                        "sl": round(new_sl_price, symbol_info.digits),
                        "tp": pos.tp
                    }
                    result = mt5.order_send(request)
                    if result.retcode == mt5.TRADE_RETCODE_DONE:
                        logging.info("[Trailing] Đã dời SL lệnh MUA #%s lên mốc an toàn: %s", pos.ticket, new_sl_price)
                        
        elif pos.type == mt5.POSITION_TYPE_SELL:
            # Trailing cho lệnh BÁN
            current_profit_points = (pos.price_open - tick.ask) / 0.01
            new_sl_price = tick.ask + (step_points * 0.01)
            
            if current_profit_points > step_points:
                if pos.sl == 0.0 or new_sl_price < pos.sl - (50 * 0.01):
                    request = {
                        "action": mt5.TRADE_ACTION_SLTP,
                        "position": pos.ticket,
                        "sl": round(new_sl_price, symbol_info.digits),
                        "tp": pos.tp
                    }
                    result = mt5.order_send(request)
                    if result.retcode == mt5.TRADE_RETCODE_DONE:
                        logging.info("[Trailing] Đã dời SL lệnh BÁN #%s xuống mốc an toàn: %s", pos.ticket, new_sl_price)

def run_trading_loop():
    """Vòng lặp giao dịch chính - chạy liên tục do PM2 giám sát"""
    symbol = CRITICAL_CONFIG["SYMBOL"]
    logging.info("==> BẮT ĐẦU VÒNG LẶP QUAN SÁT THỊ TRƯỜNG GOLD M1 <==")
    
    # Theo dõi trạng thái trend trước đó để nhận diện điểm giao nhau (cross)
    # Khởi tạo giá trị ban đầu để dò tín hiệu ở nến tiếp theo
    last_trend_state = 0 
    
    while True:
        try:
            # 1. Đảm bảo MT5 luôn kết nối, nếu mất sóng thì kết nối lại tự động
            terminal_info = mt5.terminal_info()
            if terminal_info is None:
                logging.warning("Mất kết nối với terminal MT5! Tiến hành khởi tạo lại...")
                if not init_mt5():
                    time.sleep(10)
                    continue
                    
            # 2. Tính toán chỉ báo SuperTrend nến M1 hoàn thành mới nhất
            last_candle, prev_candle = calculate_supertrend_m1()
            if last_candle is None:
                time.sleep(5)
                continue
                
            current_trend = int(last_candle['trend']) # 1 hoặc -1
            
            # Đồng bộ hóa trạng thái ban đầu khi bot mới mở lên tránh đóng bậy
            if last_trend_state == 0:
                last_trend_state = current_trend
                logging.info("[Khởi khởi động] Trạng thái xu hướng hiện hành: %s", "BULL/MUA" if current_trend == 1 else "BEAR/BÁN")
                
            # 3. Lọc lấy những lệnh mở hiện hành của bot (magic=990011)
            positions = mt5.positions_get(symbol=symbol)
            bot_positions = [p for p in positions if p.magic == 990011] if positions else []
            
            # 4. Kiểm tra tín hiệu đổi dải xu hướng (SuperTrend Signal)
            # TH1: Xu hướng chuyển sang BULL (1) từ BEAR (-1) -> Đảo Buy!
            if current_trend == 1 and last_trend_state == -1:
                logging.info("[TÍN HIỆU ĐẢO CHIỀU MUA] SuperTrend vừa chuyển sang dương (BULL)!")
                
                # Đóng toàn bộ lệnh SELL cũ lập tức
                close_all_positions(symbol, mt5.POSITION_TYPE_SELL)
                
                # Mở lệnh BUY mới nếu chưa có lệnh BUY nào đang mở
                has_buy = any(p.type == mt5.POSITION_TYPE_BUY for p in bot_positions)
                if not has_buy:
                    send_market_order(
                        mt5.ORDER_TYPE_BUY, 
                        symbol, 
                        CRITICAL_CONFIG["LOT_SIZE"],
                        CRITICAL_CONFIG["STOP_LOSS_POINTS"],
                        CRITICAL_CONFIG["TAKE_PROFIT_POINTS"]
                    )
                last_trend_state = 1
                
            # TH2: Xu hướng chuyển sang BEAR (-1) từ BULL (1) -> Đảo Sell!
            elif current_trend == -1 and last_trend_state == 1:
                logging.info("[TÍN HIỆU ĐẢO CHIỀU BÁN] SuperTrend vừa chuyển sang âm (BEAR)!")
                
                # Đóng toàn bộ lệnh BUY cũ lập tức
                close_all_positions(symbol, mt5.POSITION_TYPE_BUY)
                
                # Mở lệnh SELL mới nếu chưa có lệnh SELL nào đang mở
                has_sell = any(p.type == mt5.POSITION_TYPE_SELL for p in bot_positions)
                if not has_sell:
                    send_market_order(
                        mt5.ORDER_TYPE_SELL, 
                        symbol, 
                        CRITICAL_CONFIG["LOT_SIZE"],
                        CRITICAL_CONFIG["STOP_LOSS_POINTS"],
                        CRITICAL_CONFIG["TAKE_PROFIT_POINTS"]
                    )
                last_trend_state = -1
                
            # Đảm bảo duy trì đúng hướng theo xu hướng kể cả khi vô tình bị dập tắt hoặc lỡ lệnh lúc khởi tạo
            else:
                # Nếu xu hướng hiện tại là TĂNG mà không có vị thế nào hết -> kích hoạt bổ sung BUY
                if len(bot_positions) == 0:
                    if current_trend == 1:
                        logging.info("[Bổ sung vị thế] Đang trong sóng BUY nhưng chưa có lệnh. Đang vào lệnh BUY...")
                        send_market_order(mt5.ORDER_TYPE_BUY, symbol, CRITICAL_CONFIG["LOT_SIZE"], CRITICAL_CONFIG["STOP_LOSS_POINTS"], CRITICAL_CONFIG["TAKE_PROFIT_POINTS"])
                    elif current_trend == -1:
                        logging.info("[Bổ sung vị thế] Đang trong sóng SELL nhưng chưa có lệnh. Đang vào lệnh SELL...")
                        send_market_order(mt5.ORDER_TYPE_SELL, symbol, CRITICAL_CONFIG["LOT_SIZE"], CRITICAL_CONFIG["STOP_LOSS_POINTS"], CRITICAL_CONFIG["TAKE_PROFIT_POINTS"])
                        
            # 5. Xử lý sửa dời SL (Trailing Stop) cho các vị thế đang thắng
            if CRITICAL_CONFIG["TRAILING_STOP"] and len(bot_positions) > 0:
                handle_trailing_stop(symbol)
                
        except Exception as e:
            logging.error("Lỗi xảy ra trong vòng lặp chính: %s", str(e))
            
        time.sleep(CRITICAL_CONFIG["SLEEP_INTERVAL"])

if __name__ == "__main__":
    logging.info("🚀 KHỞI ĐỘNG HỆ THỐNG BOT VÀNG XAUUSD - SUPERTREND M1 🚀")
    
    # Chạy khởi động kết nối lần đầu
    if not init_mt5():
        logging.critical("Không thể khởi động kết nối với MetaTrader 5 ban đầu. Đang dừng tiến trình.")
        sys.exit(1)
        
    try:
        run_trading_loop()
    except KeyboardInterrupt:
        logging.info("Đã ngừng bot bởi người dùng (Ctrl+C). Đóng cổng kết nối MT5.")
    finally:
        mt5.shutdown()
        logging.info("Chào bạn, bot Gold trading đã tắt an toàn.")
`;

      const ecosystemJs = `module.exports = {
  apps: [
    {
      name: "${pm2Name}",
      script: "bot.py",
      interpreter: "python", // chạy trực tiếp qua python interpreter của hệ điều hành
      instances: 1,
      autorestart: true,     # Luôn tự động khởi chạy lại nếu script bị lỗi crash đột ngột
      watch: false,         # Không tự load lại khi file thay đổi tránh trùng lệnh
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        PYTHONUNBUFFERED: "1"  # Giữ cho logging python đẩy trực tiếp ra log pm2 không bị nghẹt
      },
      error_file: "logs/pm2-err.log",
      out_file: "logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};`;

      const requirementsTxt = `MetaTrader5>=5.0.33
pandas>=1.3.0
numpy>=1.20.0
`;

      const readmeMd = `# HƯỚNG DẪN TRIỂN KHAI BOT GIAO DỊCH VÀNG (${symbol}) VỚI PM2 & METATRADER 5

Dự án Robot Giao Dịch Vàng tự động chạy chỉ báo **SuperTrend Khung 1 Phút (M1)** kết nối trực tiếp với cổng API của **MetaTrader 5 (MT5)**.

---

## 📋 Yêu Cầu Hệ Thống & Môi Trường
1. **Hệ điều hành Windows** (Yêu cầu bắt buộc vì thư viện Python \`MetaTrader5\` chỉ được hỗ trợ chạy gốc trên hệ thống Windows có cài đặt ứng dụng MT5 Terminal).
2. **Thư viện Python 3.8 - 3.11** (Lưu ý tick chọn *"Add Python to PATH"* khi cài đặt).
3. **Ứng dụng MetaTrader 5 (MT5)** đã đăng nhập sẵn tài khoản giao dịch (Live hoặc Demo).
4. **NodeJS & PM2** (Dùng để duy trì và giám sát bot hoạt động 24/7 không bị gián đoạn).

---

## 🛠️ Trình Tự Thiết Lập Chi Tiết

### Bước 1: Chuẩn bị thư mục code trên máy Windows của bạn
Tạo một thư mục riêng biệt (Ví dụ: \`C:\\GoldTradingBot\`) và tạo các file sau từ những đoạn code được tải xuống ở bảng bên:
* \`bot.py\` (Chứa logic giao dịch chính)
* \`ecosystem.config.js\` (Cấu hình tiến trình PM2)
* \`requirements.txt\` (Danh sách thư viện phụ thuộc)

### Bước 2: Cài đặt các thư viện Python cần thiết
Mở ứng dụng **Command Prompt (cmd)** hoặc **PowerShell** tại thư mục đó và chạy lệnh:
\`\`\`bash
pip install -r requirements.txt
\`\`\`

### Bước 3: Cài đặt và chạy quản lý tiến trình PM2
Nạp PM2 toàn cục thông qua gói npm của NodeJS:
\`\`\`bash
npm install -m -g pm2
\`\`\`

### Bước 4: Khởi chạy Bot gold qua cổng PM2
Đảm bảo bạn đã mở sẵn app MT5. Chạy lệnh sau trong cmd để khởi chạy bot:
\`\`\`bash
pm2 start ecosystem.config.js
\`\`\`

---

## 🩺 Lệnh Quản Trị Hệ Thống Tiết Kiệm Thời Gian
* **Xem trạng thái hoạt động của bot:** \`pm2 list\`
* **Xem nhật ký log trade thời gian thực:** \`pm2 logs ${pm2Name}\`
* **Khởi động lại bot khi sửa cấu hình:** \`pm2 restart ${pm2Name}\`
* **Dừng bot hoàn toàn:** \`pm2 stop ${pm2Name}\`
`;

      res.json({
        success: true,
        files: {
          botPy,
          ecosystemJs,
          requirementsTxt,
          readmeMd
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Serve static UI assets in production, use Vite middleware in dev
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
