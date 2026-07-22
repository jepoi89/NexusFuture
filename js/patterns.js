/**
 * Pure JavaScript Candlestick Pattern Detection
 * Analyzes candlestick data structures to locate popular patterns
 * Returns an array of pattern labels or triggers for each candle index
 */

/**
 * Detect Hammer Pattern
 * Characteristics: Small body at the upper end of the trading range, long lower shadow.
 */
export function isHammer(c, prev) {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) return false;

    const upperShadow = c.high - Math.max(c.open, c.close);
    const lowerShadow = Math.min(c.open, c.close) - c.low;

    // Lower shadow should be at least 2x the body, small upper shadow
    return lowerShadow >= 2 * body && upperShadow <= 0.1 * range && body > 0;
}

/**
 * Detect Shooting Star Pattern
 * Characteristics: Small body at lower end, long upper shadow.
 */
export function isShootingStar(c) {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) return false;

    const upperShadow = c.high - Math.max(c.open, c.close);
    const lowerShadow = Math.min(c.open, c.close) - c.low;

    return upperShadow >= 2 * body && lowerShadow <= 0.1 * range && body > 0;
}

/**
 * Detect Morning Star Pattern
 * Characteristics: 3-candle bullish reversal pattern. Bearish, small body/doji, Bullish.
 */
export function isMorningStar(c, prev, prev2) {
    if (!prev || !prev2) return false;

    const firstBearish = prev2.close < prev2.open;
    const thirdBullish = c.close > c.open;

    // Small star candle in the middle
    const prevBody = Math.abs(prev.close - prev.open);
    const prev2Body = Math.abs(prev2.close - prev2.open);
    const starBody = prevBody < 0.25 * prev2Body;

    // Star gaps or stays low
    const starIsLow = prev.close < prev2.close && prev.open < prev2.close;

    // Third candle closes above middle of the first bearish candle
    const firstMiddle = prev2.low + (prev2.high - prev2.low) / 2;
    const thirdStrong = c.close > firstMiddle;

    return firstBearish && starBody && starIsLow && thirdBullish && thirdStrong;
}

/**
 * Detect Evening Star Pattern
 * Characteristics: 3-candle bearish reversal pattern. Bullish, small body/doji, Bearish.
 */
export function isEveningStar(c, prev, prev2) {
    if (!prev || !prev2) return false;

    const firstBullish = prev2.close > prev2.open;
    const thirdBearish = c.close < c.open;

    const prevBody = Math.abs(prev.close - prev.open);
    const prev2Body = Math.abs(prev2.close - prev2.open);
    const starBody = prevBody < 0.25 * prev2Body;

    const starIsHigh = prev.close > prev2.close && prev.open > prev2.close;
    const firstMiddle = prev2.low + (prev2.high - prev2.low) / 2;
    const thirdStrong = c.close < firstMiddle;

    return firstBullish && starBody && starIsHigh && thirdBearish && thirdStrong;
}

/**
 * Detect Bullish Engulfing
 */
export function isBullishEngulfing(c, prev) {
    if (!prev) return false;
    const isPrevBearish = prev.close < prev.open;
    const isCurrBullish = c.close > c.open;

    return isPrevBearish && isCurrBullish && c.open <= prev.close && c.close >= prev.open;
}

/**
 * Detect Bearish Engulfing
 */
export function isBearishEngulfing(c, prev) {
    if (!prev) return false;
    const isPrevBullish = prev.close > prev.open;
    const isCurrBearish = c.close < c.open;

    return isPrevBullish && isCurrBearish && c.open >= prev.close && c.close <= prev.open;
}

/**
 * Detect Doji Pattern
 */
export function isDoji(c) {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) return false;
    return body <= 0.05 * range;
}

/**
 * Detect Harami Pattern (Inside bar reversal)
 */
export function isHarami(c, prev) {
    if (!prev) return false;
    const prevBodyMin = Math.min(prev.open, prev.close);
    const prevBodyMax = Math.max(prev.open, prev.close);
    const currBodyMin = Math.min(c.open, c.close);
    const currBodyMax = Math.max(c.open, c.close);

    const engulfed = currBodyMin > prevBodyMin && currBodyMax < prevBodyMax;
    // Opposite colors
    const oppositeColor = (prev.close > prev.open && c.close < c.open) || (prev.close < prev.open && c.close > c.open);

    return engulfed && oppositeColor;
}

/**
 * Detect Three White Soldiers (Three bullish candles with strong bodies)
 */
export function isThreeWhiteSoldiers(c, prev, prev2) {
    if (!prev || !prev2) return false;
    const c1 = prev2.close > prev2.open && (prev2.close - prev2.open) / (prev2.high - prev2.low) > 0.6;
    const c2 = prev.close > prev.open && (prev.close - prev.open) / (prev.high - prev.low) > 0.6;
    const c3 = c.close > c.open && (c.close - c.open) / (c.high - c.low) > 0.6;

    return c1 && c2 && c3 && c.close > prev.close && prev.close > prev2.close;
}

/**
 * Detect Three Black Crows (Three bearish candles with strong bodies)
 */
export function isThreeBlackCrows(c, prev, prev2) {
    if (!prev || !prev2) return false;
    const c1 = prev2.close < prev2.open && (prev2.open - prev2.close) / (prev2.high - prev2.low) > 0.6;
    const c2 = prev.close < prev.open && (prev.open - prev.close) / (prev.high - prev.low) > 0.6;
    const c3 = c.close < c.open && (c.open - c.close) / (c.high - c.low) > 0.6;

    return c1 && c2 && c3 && c.close < prev.close && prev.close < prev2.close;
}

/**
 * Detect Pin Bar (Similar to Hammer but can be bullish or bearish, long tail)
 */
export function isPinBar(c) {
    const range = c.high - c.low;
    if (range === 0) return false;
    const body = Math.abs(c.close - c.open);
    const lowerShadow = Math.min(c.open, c.close) - c.low;
    const upperShadow = c.high - Math.max(c.open, c.close);

    const isBullishPin = lowerShadow >= 2 * body && upperShadow <= 0.15 * range;
    const isBearishPin = upperShadow >= 2 * body && lowerShadow <= 0.15 * range;

    return isBullishPin || isBearishPin;
}

/**
 * Detect Inside Bar
 */
export function isInsideBar(c, prev) {
    if (!prev) return false;
    return c.high < prev.high && c.low > prev.low;
}

/**
 * Detect Outside Bar
 */
export function isOutsideBar(c, prev) {
    if (!prev) return false;
    return c.high > prev.high && c.low < prev.low;
}

/**
 * Detect Piercing Line Pattern (Bullish Reversal)
 */
export function isPiercingLine(c, prev) {
    if (!prev) return false;
    const isPrevBearish = prev.close < prev.open;
    const isCurrBullish = c.close > c.open;
    if (!isPrevBearish || !isCurrBullish) return false;

    const prevMidpoint = prev.close + (prev.open - prev.close) / 2;
    return c.open < prev.close && c.close > prevMidpoint && c.close < prev.open;
}

/**
 * Detect Dark Cloud Cover Pattern (Bearish Reversal)
 */
export function isDarkCloudCover(c, prev) {
    if (!prev) return false;
    const isPrevBullish = prev.close > prev.open;
    const isCurrBearish = c.close < c.open;
    if (!isPrevBullish || !isCurrBearish) return false;

    const prevMidpoint = prev.open + (prev.close - prev.open) / 2;
    return c.open > prev.close && c.close < prevMidpoint && c.close > prev.open;
}

/**
 * Scans candlestick sequence and returns detected patterns at each index
 * @param {Array<object>} candles 
 * @returns {Array<Array<string>>}
 */
export function detectPatterns(candles) {
    const results = [];
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const prev = i > 0 ? candles[i - 1] : null;
        const prev2 = i > 1 ? candles[i - 2] : null;

        const patterns = [];

        if (isHammer(c, prev)) patterns.push('Hammer');
        if (isShootingStar(c)) patterns.push('Shooting Star');
        if (isMorningStar(c, prev, prev2)) patterns.push('Morning Star');
        if (isEveningStar(c, prev, prev2)) patterns.push('Evening Star');
        if (isBullishEngulfing(c, prev)) patterns.push('Bullish Engulfing');
        if (isBearishEngulfing(c, prev)) patterns.push('Bearish Engulfing');
        if (isDoji(c)) patterns.push('Doji');
        if (isHarami(c, prev)) patterns.push('Harami');
        if (isThreeWhiteSoldiers(c, prev, prev2)) patterns.push('Three White Soldiers');
        if (isThreeBlackCrows(c, prev, prev2)) patterns.push('Three Black Crows');
        if (isPinBar(c)) patterns.push('Pin Bar');
        if (isInsideBar(c, prev)) patterns.push('Inside Bar');
        if (isOutsideBar(c, prev)) patterns.push('Outside Bar');
        if (isPiercingLine(c, prev)) patterns.push('Piercing Line');
        if (isDarkCloudCover(c, prev)) patterns.push('Dark Cloud Cover');

        results.push(patterns);
    }
    return results;
}
