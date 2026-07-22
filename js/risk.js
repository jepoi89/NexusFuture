/**
 * Risk Management Calculator
 * Computes trade configuration matrices: Suggest entry, take profits, stop losses, leverage, and risk-reward ratios
 */

import { calculateATR } from './indicators.js';

export class RiskCalculator {
    constructor() {}

    /**
     * Build risk-reward profile
     * @param {Array<object>} candles - Candle sequence
     * @param {string} recType - Direction: e.g. "LONG", "SHORT"
     * @param {number} atrMultiplier - Stop Loss distance multiplier
     */
    calculateProfile(candles, recType, atrMultiplier = 2) {
        if (!candles || candles.length < 20) {
            return this.defaultProfile();
        }

        const idx = candles.length - 1;
        const currentClose = candles[idx].close;

        // Calculate ATR to judge volatility & risk distances
        const atrArray = calculateATR(candles, 14);
        const currentAtr = atrArray[idx] || (currentClose * 0.01); // fallback to 1%

        const isLong = recType.includes('LONG') || recType === 'BUY';
        const isShort = recType.includes('SHORT') || recType === 'SELL';

        if (!isLong && !isShort) {
            return this.defaultProfile();
        }

        // 1. Suggested entry target is near current price
        const entryPrice = currentClose;

        // 2. Stop Loss is determined by ATR (safer stop loss)
        const stopDistance = currentAtr * atrMultiplier;
        const stopLoss = isLong ? (entryPrice - stopDistance) : (entryPrice + stopDistance);

        // 3. Three distinct Take Profit targets
        const tp1Dist = stopDistance * 1.5;
        const tp2Dist = stopDistance * 2.5;
        const tp3Dist = stopDistance * 4.0;

        const tp1 = isLong ? (entryPrice + tp1Dist) : (entryPrice - tp1Dist);
        const tp2 = isLong ? (entryPrice + tp2Dist) : (entryPrice - tp2Dist);
        const tp3 = isLong ? (entryPrice + tp3Dist) : (entryPrice - tp3Dist);

        // 4. Risk-Reward Ratio
        const actualRisk = Math.abs(entryPrice - stopLoss);
        const actualReward = Math.abs(tp1 - entryPrice);
        const riskRewardRatio = actualRisk > 0 ? (actualReward / actualRisk).toFixed(2) : '1:1.5';

        // 5. Suggested Leverage
        // Higher ATR means higher volatility, which requires LOWER leverage to avoid instant liquidation
        const volatilityPercent = (currentAtr / entryPrice) * 100;
        let leverage = 10; // baseline
        if (volatilityPercent < 0.2) leverage = 25;
        else if (volatilityPercent < 0.5) leverage = 20;
        else if (volatilityPercent < 1.0) leverage = 15;
        else if (volatilityPercent < 2.0) leverage = 10;
        else if (volatilityPercent < 3.5) leverage = 5;
        else leverage = 2; // high volatile coin

        // 6. Liquidation warning flag
        const isHighVolatility = volatilityPercent > 2.5;

        return {
            positionType: isLong ? 'LONG' : 'SHORT',
            entryPrice,
            stopLoss,
            tp1,
            tp2,
            tp3,
            riskRewardRatio: `1:${riskRewardRatio}`,
            suggestedLeverage: `${leverage}x`,
            highRiskWarning: isHighVolatility
        };
    }

    defaultProfile() {
        return {
            positionType: 'HOLD',
            entryPrice: 0,
            stopLoss: 0,
            tp1: 0,
            tp2: 0,
            tp3: 0,
            riskRewardRatio: '--',
            suggestedLeverage: '--',
            highRiskWarning: false
        };
    }
}
