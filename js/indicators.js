/**
 * Technical Indicator Calculations implemented purely in JavaScript.
 * Processes arrays of candle objects containing {open, high, low, close, volume}.
 */

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
            continue;
        }
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma.push(sum / period);
    }
    return sma;
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(data, period) {
    const ema = [];
    if (data.length === 0) return ema;
    
    const k = 2 / (period + 1);
    let prevEma = null;

    // First EMA is simple SMA
    let firstSum = 0;
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            ema.push(null);
            continue;
        }
        if (prevEma === null) {
            for (let j = 0; j < period; j++) {
                firstSum += data[i - j].close;
            }
            prevEma = firstSum / period;
            ema.push(prevEma);
        } else {
            const currentEma = data[i].close * k + prevEma * (1 - k);
            ema.push(currentEma);
            prevEma = currentEma;
        }
    }
    return ema;
}

/**
 * Relative Strength Index (RSI)
 */
export function calculateRSI(data, period = 14) {
    const rsi = [];
    if (data.length <= period) {
        return new Array(data.length).fill(null);
    }

    let gains = 0;
    let losses = 0;

    // First gain/loss change
    for (let i = 1; i <= period; i++) {
        const diff = data[i].close - data[i - 1].close;
        if (diff > 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            rsi.push(null);
            continue;
        }
        if (i > period) {
            const diff = data[i].close - data[i - 1].close;
            const currentGain = diff > 0 ? diff : 0;
            const currentLoss = diff < 0 ? -diff : 0;

            avgGain = (avgGain * (period - 1) + currentGain) / period;
            avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
        }

        if (avgLoss === 0) {
            rsi.push(100);
        } else {
            const rs = avgGain / avgLoss;
            rsi.push(100 - (100 / (1 + rs)));
        }
    }
    return rsi;
}

/**
 * Moving Average Convergence Divergence (MACD)
 * Returns { macdLine, signalLine, histogram } arrays
 */
export function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEma = calculateEMA(data, fastPeriod);
    const slowEma = calculateEMA(data, slowPeriod);
    
    const macdLine = [];
    const dummyData = []; // to calc EMA of MACD Line

    for (let i = 0; i < data.length; i++) {
        if (fastEma[i] === null || slowEma[i] === null) {
            macdLine.push(null);
            dummyData.push({ close: 0 });
        } else {
            const val = fastEma[i] - slowEma[i];
            macdLine.push(val);
            dummyData.push({ close: val });
        }
    }

    // Signal Line is EMA of MACD Line
    const signalLine = calculateEMA(dummyData, signalPeriod);
    const histogram = [];

    for (let i = 0; i < data.length; i++) {
        if (macdLine[i] === null || signalLine[i] === null) {
            histogram.push(null);
        } else {
            histogram.push(macdLine[i] - signalLine[i]);
        }
    }

    return { macdLine, signalLine, histogram };
}

/**
 * Average True Range (ATR)
 */
export function calculateATR(data, period = 14) {
    const atr = [];
    if (data.length === 0) return atr;

    const trs = [0]; // First TR is 0
    for (let i = 1; i < data.length; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const prevC = data[i - 1].close;

        const tr = Math.max(
            h - l,
            Math.abs(h - prevC),
            Math.abs(l - prevC)
        );
        trs.push(tr);
    }

    let prevAtr = null;
    let trSum = 0;

    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            trSum += trs[i];
            atr.push(null);
            continue;
        }
        if (prevAtr === null) {
            prevAtr = trSum / period;
            atr.push(prevAtr);
        } else {
            const currentAtr = (prevAtr * (period - 1) + trs[i]) / period;
            atr.push(currentAtr);
            prevAtr = currentAtr;
        }
    }
    return atr;
}

/**
 * Average Directional Index (ADX)
 * Returns { adx, plusDI, minusDI } arrays
 */
export function calculateADX(data, period = 14) {
    const adx = [];
    const plusDI = [];
    const minusDI = [];

    if (data.length <= period * 2) {
        return {
            adx: new Array(data.length).fill(null),
            plusDI: new Array(data.length).fill(null),
            minusDI: new Array(data.length).fill(null)
        };
    }

    const tr = [0];
    const plusDM = [0];
    const minusDM = [0];

    for (let i = 1; i < data.length; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const prevH = data[i - 1].high;
        const prevL = data[i - 1].low;
        const prevC = data[i - 1].close;

        tr.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));

        const upMove = h - prevH;
        const downMove = prevL - l;

        if (upMove > downMove && upMove > 0) {
            plusDM.push(upMove);
        } else {
            plusDM.push(0);
        }

        if (downMove > upMove && downMove > 0) {
            minusDM.push(downMove);
        } else {
            minusDM.push(0);
        }
    }

    let smoothedTR = 0;
    let smoothedPlusDM = 0;
    let smoothedMinusDM = 0;

    // Initial sum
    for (let i = 1; i <= period; i++) {
        smoothedTR += tr[i];
        smoothedPlusDM += plusDM[i];
        smoothedMinusDM += minusDM[i];
    }

    const dxs = [];

    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            plusDI.push(null);
            minusDI.push(null);
            dxs.push(null);
            adx.push(null);
            continue;
        }

        if (i > period) {
            smoothedTR = smoothedTR - (smoothedTR / period) + tr[i];
            smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
            smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
        }

        const pDI = (smoothedPlusDM / smoothedTR) * 100;
        const mDI = (smoothedMinusDM / smoothedTR) * 100;

        plusDI.push(pDI);
        minusDI.push(mDI);

        const diff = Math.abs(pDI - mDI);
        const sum = pDI + mDI;
        const dx = sum === 0 ? 0 : (diff / sum) * 100;
        dxs.push(dx);

        // Calculate ADX from DX
        if (i < period * 2 - 1) {
            adx.push(null);
        } else if (i === period * 2 - 1) {
            let dxSum = 0;
            for (let j = period; j < period * 2; j++) {
                dxSum += dxs[j];
            }
            adx.push(dxSum / period);
        } else {
            const prevADX = adx[i - 1];
            adx.push((prevADX * (period - 1) + dx) / period);
        }
    }

    return { adx, plusDI, minusDI };
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(data) {
    const vwap = [];
    let cumulativeTPV = 0; // Typical Price * Volume
    let cumulativeVol = 0;

    for (let i = 0; i < data.length; i++) {
        const tp = (data[i].high + data[i].low + data[i].close) / 3;
        cumulativeTPV += tp * data[i].volume;
        cumulativeVol += data[i].volume;

        if (cumulativeVol === 0) {
            vwap.push(tp);
        } else {
            vwap.push(cumulativeTPV / cumulativeVol);
        }
    }
    return vwap;
}

/**
 * On-Balance Volume (OBV)
 */
export function calculateOBV(data) {
    const obv = [];
    if (data.length === 0) return obv;

    let currentObv = 0;
    obv.push(currentObv);

    for (let i = 1; i < data.length; i++) {
        if (data[i].close > data[i - 1].close) {
            currentObv += data[i].volume;
        } else if (data[i].close < data[i - 1].close) {
            currentObv -= data[i].volume;
        }
        obv.push(currentObv);
    }
    return obv;
}

/**
 * Stochastic RSI
 * Returns { k, d } arrays
 */
export function calculateStochasticRSI(data, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
    const rsi = calculateRSI(data, rsiPeriod);
    const stochRSI = [];

    for (let i = 0; i < data.length; i++) {
        if (i < rsiPeriod + stochPeriod) {
            stochRSI.push(null);
            continue;
        }

        let minRsi = Infinity;
        let maxRsi = -Infinity;

        for (let j = 0; j < stochPeriod; j++) {
            const val = rsi[i - j];
            if (val === null) continue;
            if (val < minRsi) minRsi = val;
            if (val > maxRsi) maxRsi = val;
        }

        const currentRsi = rsi[i];
        if (maxRsi - minRsi === 0) {
            stochRSI.push(0);
        } else {
            stochRSI.push((currentRsi - minRsi) / (maxRsi - minRsi));
        }
    }

    // %K is SMA of Stochastic RSI
    const k = [];
    for (let i = 0; i < data.length; i++) {
        if (i < rsiPeriod + stochPeriod + kPeriod) {
            k.push(null);
            continue;
        }
        let sum = 0;
        for (let j = 0; j < kPeriod; j++) {
            sum += stochRSI[i - j];
        }
        k.push((sum / kPeriod) * 100);
    }

    // %D is SMA of %K
    const d = [];
    for (let i = 0; i < data.length; i++) {
        if (i < rsiPeriod + stochPeriod + kPeriod + dPeriod) {
            d.push(null);
            continue;
        }
        let sum = 0;
        for (let j = 0; j < dPeriod; j++) {
            sum += k[i - j];
        }
        d.push(sum / dPeriod);
    }

    return { k, d };
}

/**
 * Bollinger Bands
 * Returns { upper, middle, lower } arrays
 */
export function calculateBollingerBands(data, period = 20, multiplier = 2) {
    const middle = calculateSMA(data, period);
    const upper = [];
    const lower = [];

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            upper.push(null);
            lower.push(null);
            continue;
        }

        let varianceSum = 0;
        const mean = middle[i];

        for (let j = 0; j < period; j++) {
            varianceSum += Math.pow(data[i - j].close - mean, 2);
        }

        const standardDeviation = Math.sqrt(varianceSum / period);
        upper.push(mean + multiplier * standardDeviation);
        lower.push(mean - multiplier * standardDeviation);
    }

    return { upper, middle, lower };
}

/**
 * Parabolic SAR (Stop and Reverse)
 */
export function calculateParabolicSAR(data, step = 0.02, maxStep = 0.2) {
    const sar = [];
    if (data.length < 2) return new Array(data.length).fill(null);

    let isLong = data[1].close > data[0].close;
    let ep = isLong ? data[1].high : data[1].low;
    let af = step;
    
    // First SAR is opposite extreme
    let currentSar = isLong ? data[0].low : data[0].high;
    sar.push(currentSar);

    for (let i = 1; i < data.length; i++) {
        sar.push(currentSar);

        const nextSarIsLong = isLong;
        let nextSar = currentSar + af * (ep - currentSar);

        if (isLong) {
            nextSar = Math.min(nextSar, data[i - 1].low, i > 1 ? data[i - 2].low : data[i - 1].low);
            if (data[i].low < nextSar) {
                isLong = false;
                nextSar = ep; // Reverse EP to low
                ep = data[i].low;
                af = step;
            } else {
                if (data[i].high > ep) {
                    ep = data[i].high;
                    af = Math.min(af + step, maxStep);
                }
            }
        } else {
            nextSar = Math.max(nextSar, data[i - 1].high, i > 1 ? data[i - 2].high : data[i - 1].high);
            if (data[i].high > nextSar) {
                isLong = true;
                nextSar = ep; // Reverse EP to high
                ep = data[i].high;
                af = step;
            } else {
                if (data[i].low < ep) {
                    ep = data[i].low;
                    af = Math.min(af + step, maxStep);
                }
            }
        }

        currentSar = nextSar;
    }
    return sar;
}

/**
 * SuperTrend Indicator
 * Returns { trend, supertrend } arrays where trend is +1 (bullish) or -1 (bearish)
 */
export function calculateSuperTrend(data, period = 10, multiplier = 3) {
    const atr = calculateATR(data, period);
    const supertrend = [];
    const trend = []; // 1 for bull, -1 for bear

    if (data.length === 0) return { trend, supertrend };

    let prevClose = data[0].close;
    let prevBasicUpper = 0;
    let prevBasicLower = 0;
    let prevFinalUpper = 0;
    let prevFinalLower = 0;
    let prevTrend = 1;

    for (let i = 0; i < data.length; i++) {
        if (i < period || atr[i] === null) {
            supertrend.push(null);
            trend.push(1);
            continue;
        }

        const hl2 = (data[i].high + data[i].low) / 2;
        const basicUpper = hl2 + multiplier * atr[i];
        const basicLower = hl2 - multiplier * atr[i];

        let finalUpper = basicUpper;
        if (basicUpper < prevFinalUpper || data[i - 1].close > prevFinalUpper) {
            finalUpper = basicUpper;
        } else {
            finalUpper = prevFinalUpper;
        }

        let finalLower = basicLower;
        if (basicLower > prevFinalLower || data[i - 1].close < prevFinalLower) {
            finalLower = basicLower;
        } else {
            finalLower = prevFinalLower;
        }

        let currentTrend = prevTrend;
        if (prevTrend === 1 && data[i].close < finalUpper) {
            currentTrend = -1;
        } else if (prevTrend === -1 && data[i].close > finalLower) {
            currentTrend = 1;
        }

        const val = currentTrend === 1 ? finalLower : finalUpper;
        supertrend.push(val);
        trend.push(currentTrend);

        prevBasicUpper = basicUpper;
        prevBasicLower = basicLower;
        prevFinalUpper = finalUpper;
        prevFinalLower = finalLower;
        prevTrend = currentTrend;
    }

    return { trend, supertrend };
}

/**
 * Ichimoku Cloud
 * Returns { tenkan, kijun, senkouA, senkouB, chikou } arrays
 */
export function calculateIchimoku(data, tenkanPeriod = 9, kijunPeriod = 26, senkouBPeriod = 52, displacement = 26) {
    const tenkan = [];
    const kijun = [];
    const senkouA = [];
    const senkouB = [];
    const chikou = [];

    const getDonchianValue = (slice, len) => {
        if (slice.length < len) return null;
        let high = -Infinity;
        let low = Infinity;
        for (let i = slice.length - len; i < slice.length; i++) {
            if (slice[i].high > high) high = slice[i].high;
            if (slice[i].low < low) low = slice[i].low;
        }
        return (high + low) / 2;
    };

    for (let i = 0; i < data.length; i++) {
        const slice9 = data.slice(0, i + 1);
        tenkan.push(getDonchianValue(slice9, tenkanPeriod));
        kijun.push(getDonchianValue(slice9, kijunPeriod));
        senkouB.push(getDonchianValue(slice9, senkouBPeriod));
    }

    // Senkou Span A is displacement ahead
    for (let i = 0; i < data.length; i++) {
        if (tenkan[i] === null || kijun[i] === null) {
            senkouA.push(null);
        } else {
            senkouA.push((tenkan[i] + kijun[i]) / 2);
        }
    }

    // Chikou Span is lagging close line (normally plotted 26 bars back)
    for (let i = 0; i < data.length; i++) {
        if (i + displacement < data.length) {
            chikou.push(data[i + displacement].close);
        } else {
            chikou.push(null);
        }
    }

    return { tenkan, kijun, senkouA, senkouB, chikou };
}

/**
 * Pivot Points Standard Daily
 * Returns { pivot, r1, s1, r2, s2, r3, s3 }
 */
export function calculatePivotPoints(high, low, close) {
    const pivot = (high + low + close) / 3;
    const r1 = 2 * pivot - low;
    const s1 = 2 * pivot - high;
    const r2 = pivot + (high - low);
    const s2 = pivot - (high - low);
    const r3 = high + 2 * (pivot - low);
    const s3 = low - 2 * (high - pivot);

    return { pivot, r1, s1, r2, s2, r3, s3 };
}

/**
 * Fibonacci Retracement Levels
 * Returns standard percentage prices based on high and low bounds
 */
export function calculateFibonacciRetracement(high, low) {
    const diff = high - low;
    return {
        level0: high,
        level236: high - 0.236 * diff,
        level382: high - 0.382 * diff,
        level500: high - 0.500 * diff,
        level618: high - 0.618 * diff,
        level786: high - 0.786 * diff,
        level100: low
    };
}

/**
 * Commodity Channel Index (CCI)
 */
export function calculateCCI(data, period = 20) {
    const cci = [];
    const tp = data.map(c => (c.high + c.low + c.close) / 3);

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            cci.push(null);
            continue;
        }

        // Calculate SMA of Typical Price
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += tp[i - j];
        }
        const smaTp = sum / period;

        // Calculate Mean Deviation
        let devSum = 0;
        for (let j = 0; j < period; j++) {
            devSum += Math.abs(tp[i - j] - smaTp);
        }
        const meanDev = devSum / period;

        if (meanDev === 0) {
            cci.push(0);
        } else {
            const val = (tp[i] - smaTp) / (0.015 * meanDev);
            cci.push(val);
        }
    }
    return cci;
}

/**
 * Rate of Change (ROC)
 */
export function calculateROC(data, period = 14) {
    const roc = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            roc.push(null);
            continue;
        }
        const prevClose = data[i - period].close;
        if (prevClose === 0) {
            roc.push(0);
        } else {
            const val = ((data[i].close - prevClose) / prevClose) * 100;
            roc.push(val);
        }
    }
    return roc;
}

/**
 * Momentum Oscillator (MOM)
 */
export function calculateMomentum(data, period = 14) {
    const mom = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            mom.push(null);
            continue;
        }
        mom.push(data[i].close - data[i - period].close);
    }
    return mom;
}

/**
 * Historical Volatility (HV)
 */
export function calculateHistoricalVolatility(data, period = 20) {
    const hv = [];
    if (data.length <= 1) return new Array(data.length).fill(null);

    // Calculate daily/bar returns
    const returns = [0];
    for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1].close;
        returns.push(prev === 0 ? 0 : Math.log(data[i].close / prev));
    }

    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            hv.push(null);
            continue;
        }

        // Calculate mean return
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += returns[i - j];
        }
        const mean = sum / period;

        // Calculate variance
        let varSum = 0;
        for (let j = 0; j < period; j++) {
            varSum += Math.pow(returns[i - j] - mean, 2);
        }
        const variance = varSum / (period - 1); // sample standard deviation
        const stdDev = Math.sqrt(variance);

        // Annualized volatility (assuming 365 daily intervals; standard multiplier is 100)
        const annualized = stdDev * Math.sqrt(365) * 100;
        hv.push(annualized);
    }
    return hv;
}

/**
 * Bollinger Band Width (BBW)
 */
export function calculateBBW(data, period = 20, multiplier = 2) {
    const bb = calculateBollingerBands(data, period, multiplier);
    const bbw = [];
    for (let i = 0; i < data.length; i++) {
        if (bb.upper[i] === null || bb.lower[i] === null || bb.middle[i] === null || bb.middle[i] === 0) {
            bbw.push(null);
        } else {
            bbw.push((bb.upper[i] - bb.lower[i]) / bb.middle[i]);
        }
    }
    return bbw;
}

/**
 * Keltner Channels (KC)
 * Returns { upper, middle, lower }
 */
export function calculateKeltnerChannels(data, period = 20, atrPeriod = 10, multiplier = 2) {
    const middle = calculateEMA(data, period);
    const atr = calculateATR(data, atrPeriod);
    const upper = [];
    const lower = [];

    for (let i = 0; i < data.length; i++) {
        if (middle[i] === null || atr[i] === null) {
            upper.push(null);
            lower.push(null);
        } else {
            upper.push(middle[i] + multiplier * atr[i]);
            lower.push(middle[i] - multiplier * atr[i]);
        }
    }
    return { upper, middle, lower };
}
