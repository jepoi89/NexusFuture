/**
 * Smart Money Concepts (SMC) & Liquidity Intelligence Engine
 * Built for NEXUS Futures Phase 2.
 */

export class SMCEngine {
    constructor() {}

    /**
     * Run complete Smart Money Concepts analysis on candles
     * @param {Array<object>} candles - List of historical candles
     * @returns {object} SMC Intelligence payload
     */
    analyze(candles) {
        if (!candles || candles.length < 50) {
            return {
                institutionalBias: { bias: 'Neutral', explanation: 'Insufficient candle data to determine institutional flow.' },
                liquidity: { equalHighs: null, equalLows: null, pools: [], sweeps: [], stopHunts: [], imbalances: [] },
                zones: { orderBlocks: [], breakerBlocks: [], mitigationBlocks: [], fvgs: [], ifvgs: [], supplyDemand: [], premiumDiscount: null }
            };
        }

        const idx = candles.length - 1;
        const currentClose = candles[idx].close;

        // 1. Detect Swings
        const swings = this.detectSwings(candles, 3);

        // 2. Premium / Discount Zones
        const premiumDiscount = this.calculatePremiumDiscount(candles);

        // 3. Equal Highs and Equal Lows
        const equalHighs = this.detectEqualHighs(swings.highs, currentClose);
        const equalLows = this.detectEqualLows(swings.lows, currentClose);

        // 4. Liquidity Pools (Buy Side & Sell Side)
        const pools = this.detectLiquidityPools(swings, equalHighs, equalLows, currentClose);

        // 5. Liquidity Sweeps & Stop Hunts
        const sweepsAndStopHunts = this.detectSweepsAndStopHunts(candles, swings, currentClose);

        // 6. Market Imbalances
        const imbalances = this.detectMarketImbalances(candles);

        // 7. Fair Value Gaps & Inverse Fair Value Gaps
        const fvgsResult = this.detectFVGsAndIFVGs(candles);

        // 8. Order Blocks, Breakers, Mitigation Blocks
        const blocks = this.detectBlocks(candles, swings);

        // 9. Supply & Demand Zones
        const supplyDemand = this.detectSupplyAndDemand(candles, swings);

        // 10. Institutional Bias
        const institutionalBias = this.calculateInstitutionalBias(
            currentClose,
            equalHighs,
            equalLows,
            pools,
            sweepsAndStopHunts,
            blocks,
            fvgsResult,
            premiumDiscount
        );

        return {
            institutionalBias,
            liquidity: {
                equalHighs,
                equalLows,
                pools,
                sweeps: sweepsAndStopHunts.sweeps,
                stopHunts: sweepsAndStopHunts.stopHunts,
                imbalances
            },
            zones: {
                orderBlocks: blocks.orderBlocks,
                breakerBlocks: blocks.breakerBlocks,
                mitigationBlocks: blocks.mitigationBlocks,
                fvgs: fvgsResult.fvgs,
                ifvgs: fvgsResult.ifvgs,
                supplyDemand,
                premiumDiscount
            }
        };
    }

    /**
     * Find local highs and lows (pivot points)
     */
    detectSwings(candles, leftRightBars = 3) {
        const highs = []; // list of { price, index }
        const lows = [];  // list of { price, index }

        for (let i = leftRightBars; i < candles.length - leftRightBars; i++) {
            let isHigh = true;
            let isLow = true;

            const curHigh = candles[i].high;
            const curLow = candles[i].low;

            for (let j = 1; j <= leftRightBars; j++) {
                if (candles[i - j].high >= curHigh || candles[i + j].high > curHigh) {
                    isHigh = false;
                }
                if (candles[i - j].low <= curLow || candles[i + j].low < curLow) {
                    isLow = false;
                }
            }

            if (isHigh) {
                highs.push({ price: curHigh, index: i, time: candles[i].time });
            }
            if (isLow) {
                lows.push({ price: curLow, index: i, time: candles[i].time });
            }
        }

        return { highs, lows };
    }

    /**
     * Premium & Discount Zones
     */
    calculatePremiumDiscount(candles) {
        // Look at the trading range of the last 100 candles
        const lookback = Math.min(candles.length, 100);
        const sliced = candles.slice(-lookback);
        let high = -Infinity;
        let low = Infinity;

        sliced.forEach(c => {
            if (c.high > high) high = c.high;
            if (c.low < low) low = c.low;
        });

        const range = high - low;
        const equilibrium = low + range / 2;
        const current = candles[candles.length - 1].close;

        let zoneName = 'Equilibrium';
        let explanation = 'Price is currently at Equilibrium, meaning supply and demand are balanced. Institutional activity tends to pause here.';
        if (current > equilibrium) {
            zoneName = 'Premium Zone';
            explanation = 'Price is trading in the Premium Zone (above 50% equilibrium of the recent range). Institutions view this as expensive and typically look for short positions or profit-taking.';
        } else if (current < equilibrium) {
            zoneName = 'Discount Zone';
            explanation = 'Price is trading in the Discount Zone (below 50% equilibrium of the recent range). Institutions view this as cheap and typically seek long accumulation setups.';
        }

        return {
            high,
            low,
            equilibrium,
            current,
            zone: zoneName,
            explanation,
            whyItMatters: 'Premium/Discount zones help traders avoid buying at local highs and selling at local lows by dividing the market range into cheap and expensive territory.',
            strength: 'High',
            probability: '78%',
            potentialReaction: current > equilibrium ?
                'Expect distribution or profit-taking toward equilibrium.' :
                'Expect accumulation or dynamic bounce toward equilibrium.'
        };
    }

    /**
     * Detect Equal Highs (EQH)
     */
    detectEqualHighs(highs, currentPrice) {
        if (highs.length < 2) return null;
        // Take the last 3 swing highs and compare them
        const recentHighs = highs.slice(-3);
        for (let i = 0; i < recentHighs.length; i++) {
            for (let j = i + 1; j < recentHighs.length; j++) {
                const diff = Math.abs(recentHighs[i].price - recentHighs[j].price);
                const avg = (recentHighs[i].price + recentHighs[j].price) / 2;
                if (diff / avg < 0.0012) { // 0.12% tolerance
                    return {
                        price: avg,
                        high1: recentHighs[i],
                        high2: recentHighs[j],
                        whyItMatters: 'Equal Highs create a clean horizontal resistance line where retail stop losses (buy stops) cluster. This represents a highly lucrative pool of liquidity that market makers tend to sweep.',
                        strength: 'Medium-High',
                        probability: '82%',
                        potentialReaction: 'Market makers are likely to drive price above these highs to trigger buy stops (stop hunt) before reversing downwards.'
                    };
                }
            }
        }
        return null;
    }

    /**
     * Detect Equal Lows (EQL)
     */
    detectEqualLows(lows, currentPrice) {
        if (lows.length < 2) return null;
        const recentLows = lows.slice(-3);
        for (let i = 0; i < recentLows.length; i++) {
            for (let j = i + 1; j < recentLows.length; j++) {
                const diff = Math.abs(recentLows[i].price - recentLows[j].price);
                const avg = (recentLows[i].price + recentLows[j].price) / 2;
                if (diff / avg < 0.0012) {
                    return {
                        price: avg,
                        low1: recentLows[i],
                        low2: recentLows[j],
                        whyItMatters: 'Equal Lows create a clean horizontal support line where retail stop losses (sell stops) cluster. This represents a highly lucrative pool of liquidity that institutions tend to target.',
                        strength: 'Medium-High',
                        probability: '84%',
                        potentialReaction: 'Market makers are likely to drive price below these lows to grab sell stops (liquidity grab) before a sudden bullish reversal.'
                    };
                }
            }
        }
        return null;
    }

    /**
     * Detect Buy Side & Sell Side Liquidity Pools
     */
    detectLiquidityPools(swings, eqh, eql, currentPrice) {
        const pools = [];

        // 1. Buy Side Liquidity (BSL)
        let bslPrice = swings.highs.length > 0 ? swings.highs[swings.highs.length - 1].price : currentPrice * 1.01;
        let bslSource = 'Recent Swing High';
        if (eqh) {
            bslPrice = eqh.price;
            bslSource = 'Equal Highs Cluster';
        }

        pools.push({
            type: 'Buy Side Liquidity (BSL)',
            price: bslPrice,
            source: bslSource,
            whyItMatters: 'BSL consists of retail buy-stops (short stop-losses and breakout buy orders) placed above key resistance peaks. Institutions use this buy liquidity to fill their massive sell orders.',
            strength: eqh ? 'Strong' : 'Moderate',
            probability: '80%',
            potentialReaction: 'A swift expansion through this zone to trigger buys, followed by institutional sell positioning and a subsequent bearish reversal.'
        });

        // 2. Sell Side Liquidity (SSL)
        let sslPrice = swings.lows.length > 0 ? swings.lows[swings.lows.length - 1].price : currentPrice * 0.99;
        let sslSource = 'Recent Swing Low';
        if (eql) {
            sslPrice = eql.price;
            sslSource = 'Equal Lows Cluster';
        }

        pools.push({
            type: 'Sell Side Liquidity (SSL)',
            price: sslPrice,
            source: sslSource,
            whyItMatters: 'SSL consists of retail sell-stops (long stop-losses and breakout sell orders) placed beneath key support troughs. Institutions target this zone to buy at discount prices from panicked sellers.',
            strength: eql ? 'Strong' : 'Moderate',
            probability: '83%',
            potentialReaction: 'A quick flush beneath this zone to absorb sell orders, followed by institutional buying and a rapid upward bounce.'
        });

        return pools;
    }

    /**
     * Detect Liquidity Sweeps & Stop Hunts
     */
    detectSweepsAndStopHunts(candles, swings, currentPrice) {
        const sweeps = [];
        const stopHunts = [];

        // We check the last 5 candles for sweeps of recent swing points
        const lookback = 5;
        const startIndex = Math.max(0, candles.length - lookback);

        for (let i = startIndex; i < candles.length; i++) {
            const c = candles[i];

            // A. Bullish Sweep / Stop Hunt (Swept a recent low but closed high)
            const matchedLows = swings.lows.filter(l => l.index < i && l.index > i - 30);
            if (matchedLows.length > 0) {
                // Find the lowest low of the swings
                const targetLow = Math.min(...matchedLows.map(l => l.price));
                if (c.low < targetLow && c.close > targetLow) {
                    const isHighVolume = c.volume > (candles[i - 1]?.volume || 0) * 1.5;

                    const sweepObj = {
                        time: c.time,
                        price: targetLow,
                        sweptPrice: c.low,
                        type: 'Bullish Liquidity Sweep',
                        whyItMatters: 'Price pierced below key support levels to activate retail stop losses (sell stops) before institutional buying stepped in to drive the price back up, leaving a long lower wick.',
                        strength: isHighVolume ? 'High' : 'Medium',
                        probability: '85%',
                        potentialReaction: 'A strong bullish reversal as market makers have successfully grabbed cheap coins and cleared out early longs.'
                    };

                    sweeps.push(sweepObj);

                    if (isHighVolume) {
                        stopHunts.push({
                            ...sweepObj,
                            type: 'Bullish Stop Hunt',
                            whyItMatters: 'An aggressive, high-volume stop hunt designed to trigger massive liquidations and panicked selling below major lows, which institutions immediately absorbed.'
                        });
                    }
                }
            }

            // B. Bearish Sweep / Stop Hunt (Swept a recent high but closed low)
            const matchedHighs = swings.highs.filter(h => h.index < i && h.index > i - 30);
            if (matchedHighs.length > 0) {
                const targetHigh = Math.max(...matchedHighs.map(h => h.price));
                if (c.high > targetHigh && c.close < targetHigh) {
                    const isHighVolume = c.volume > (candles[i - 1]?.volume || 0) * 1.5;

                    const sweepObj = {
                        time: c.time,
                        price: targetHigh,
                        sweptPrice: c.high,
                        type: 'Bearish Liquidity Sweep',
                        whyItMatters: 'Price spiked above major resistance peaks to trigger retail buy-stops (short stop-losses) before institutional selling slammed the price down, leaving a long upper wick.',
                        strength: isHighVolume ? 'High' : 'Medium',
                        probability: '82%',
                        potentialReaction: 'A strong bearish reversal as market makers completed their distribution phase by trapping breakout buyers.'
                    };

                    sweeps.push(sweepObj);

                    if (isHighVolume) {
                        stopHunts.push({
                            ...sweepObj,
                            type: 'Bearish Stop Hunt',
                            whyItMatters: 'An aggressive, high-volume stop hunt designed to drive retail shorts into forced liquidations and breakout traders into trapped longs before pushing price downwards.'
                        });
                    }
                }
            }
        }

        return { sweeps, stopHunts };
    }

    /**
     * Detect Market Imbalances (Displacement candles)
     */
    detectMarketImbalances(candles) {
        const imbalances = [];
        const idx = candles.length - 1;

        // Check the last 15 candles for heavy displacement
        for (let i = idx - 15; i < idx; i++) {
            if (i < 2) continue;
            const c = candles[i];
            const prev = candles[i - 1];

            const bodySize = Math.abs(c.close - c.open);
            const avgBody = candles.slice(i - 10, i).reduce((sum, item) => sum + Math.abs(item.close - item.open), 0) / 10;

            // A candle is a displacement/imbalance candle if its body is > 2.5x the average recent body size
            if (bodySize > avgBody * 2.5) {
                const type = c.close > c.open ? 'Bullish Imbalance' : 'Bearish Imbalance';
                imbalances.push({
                    time: c.time,
                    price: (c.open + c.close) / 2,
                    low: Math.min(c.open, c.close),
                    high: Math.max(c.open, c.close),
                    type,
                    whyItMatters: 'Displacement indicates aggressive, one-sided institutional buying or selling. Price expands so fast that a severe supply/demand imbalance occurs, leaving a vacuum that the market must eventually re-test.',
                    strength: bodySize > avgBody * 4 ? 'Extreme' : 'Strong',
                    probability: '75%',
                    potentialReaction: 'Price is highly attracted to this imbalance zone and will likely drift back to fill (mitigate) this price void.'
                });
            }
        }
        return imbalances;
    }

    /**
     * Detect Fair Value Gaps (FVG) and Inverse FVGs (IFVG)
     */
    detectFVGsAndIFVGs(candles) {
        const fvgs = [];
        const ifvgs = [];
        const idx = candles.length - 1;

        // FVG detection (3-candle sequence)
        for (let i = idx - 25; i <= idx; i++) {
            if (i < 2) continue;
            const c1 = candles[i - 2];
            const c2 = candles[i - 1];
            const c3 = candles[i];

            // 1. Bullish FVG (c1.high < c3.low)
            if (c1.high < c3.low && c2.close > c2.open) {
                const fvgObj = {
                    index: i - 1,
                    time: c2.time,
                    type: 'Bullish FVG',
                    low: c1.high,
                    high: c3.low,
                    width: c3.low - c1.high,
                    whyItMatters: 'A Bullish Fair Value Gap represents an inefficiency in the market where buyers dominated aggressively. This acts as a magnet for future price action, offering a high-probability long entry when mitigated.',
                    strength: (c3.low - c1.high) / c1.high > 0.005 ? 'Strong' : 'Medium',
                    probability: '81%',
                    potentialReaction: 'Expect price to retrace downward, test the FVG zone to fill the inefficiency, and bounce aggressively from the gap low.'
                };

                // Check if this FVG was subsequently breached (turned into Inverse FVG)
                let breached = false;
                for (let k = i + 1; k <= idx; k++) {
                    if (candles[k].close < c1.high) {
                        breached = true;
                        break;
                    }
                }

                if (breached) {
                    ifvgs.push({
                        ...fvgObj,
                        type: 'Inverse Bullish FVG',
                        whyItMatters: 'A breached Bullish FVG. Now that price has closed below this institutional support gap, the gap flips into a strong overhead resistance zone.',
                        potentialReaction: 'Price is expected to find resistance and sell off upon retesting this gap from below.'
                    });
                } else {
                    fvgs.push(fvgObj);
                }
            }

            // 2. Bearish FVG (c1.low > c3.high)
            if (c1.low > c3.high && c2.close < c2.open) {
                const fvgObj = {
                    index: i - 1,
                    time: c2.time,
                    type: 'Bearish FVG',
                    low: c3.high,
                    high: c1.low,
                    width: c1.low - c3.high,
                    whyItMatters: 'A Bearish Fair Value Gap represents a severe selling inefficiency. Institutions flooded the market with sell orders, leaving an unfilled gap that now acts as dynamic overhead resistance.',
                    strength: (c1.low - c3.high) / c3.high > 0.005 ? 'Strong' : 'Medium',
                    probability: '80%',
                    potentialReaction: 'Expect price to retrace upward, fill the FVG inefficiency, and sell off aggressively from the gap high.'
                };

                let breached = false;
                for (let k = i + 1; k <= idx; k++) {
                    if (candles[k].close > c1.low) {
                        breached = true;
                        break;
                    }
                }

                if (breached) {
                    ifvgs.push({
                        ...fvgObj,
                        type: 'Inverse Bearish FVG',
                        whyItMatters: 'A breached Bearish FVG. Now that price has closed above this institutional resistance gap, the gap flips into a strong horizontal support zone.',
                        potentialReaction: 'Price is expected to hold support and bounce upon retesting this gap from above.'
                    });
                } else {
                    fvgs.push(fvgObj);
                }
            }
        }

        return { fvgs, ifvgs };
    }

    /**
     * Detect Order Blocks, Breakers, and Mitigation Blocks
     */
    detectBlocks(candles, swings) {
        const orderBlocks = [];
        const breakerBlocks = [];
        const mitigationBlocks = [];

        const idx = candles.length - 1;

        // Search through the last 30 candles for breakouts (BOS)
        for (let i = idx - 20; i <= idx; i++) {
            if (i < 5) continue;

            const current = candles[i];
            const prevHigh = Math.max(...candles.slice(i - 5, i).map(c => c.high));
            const prevLow = Math.min(...candles.slice(i - 5, i).map(c => c.low));

            // A. Bullish Break of Structure (BOS)
            if (current.close > prevHigh) {
                // Find the last down candle (Bullish Order Block) before the push
                for (let j = i - 1; j > i - 10; j--) {
                    if (j < 0) break;
                    const obCandle = candles[j];
                    if (obCandle.close < obCandle.open) {
                        const obObj = {
                            time: obCandle.time,
                            type: 'Bullish Order Block',
                            low: obCandle.low,
                            high: obCandle.high,
                            whyItMatters: 'The last down-candle before a strong bullish expansion. This zone contains massive institutional buy limit orders waiting to be filled when price retraces.',
                            strength: 'Strong',
                            probability: '84%',
                            potentialReaction: 'When price retraces to this zone, expect a sharp bullish bounce as pending institutional orders are executed.'
                        };

                        // Check if this OB was breached (closed below)
                        let breached = false;
                        for (let k = i + 1; k <= idx; k++) {
                            if (candles[k].close < obCandle.low) {
                                breached = true;
                                break;
                            }
                        }

                        if (breached) {
                            // If it swept liquidity before being broken, it is a Breaker Block
                            // Otherwise, it is a Mitigation Block
                            const sweptLiquidity = swings.lows.some(l => l.index < j && l.index > j - 10 && l.price < obCandle.low);
                            if (sweptLiquidity) {
                                breakerBlocks.push({
                                    ...obObj,
                                    type: 'Bullish Breaker Block',
                                    whyItMatters: 'A failed Bullish Order Block that swept liquidity before being broken. Upon retest from below, it flips into a strong bearish resistance level.',
                                    potentialReaction: 'Expect price to react downwards upon testing this level.'
                                });
                            } else {
                                mitigationBlocks.push({
                                    ...obObj,
                                    type: 'Bullish Mitigation Block',
                                    whyItMatters: 'A failed Bullish Order Block that did NOT sweep liquidity before being broken. It now serves as a bearish mitigation level.',
                                    potentialReaction: 'Expect price to find overhead resistance and push lower.'
                                });
                            }
                        } else {
                            orderBlocks.push(obObj);
                        }
                        break;
                    }
                }
            }

            // B. Bearish Break of Structure (BOS)
            if (current.close < prevLow) {
                // Find the last up candle (Bearish Order Block) before the drop
                for (let j = i - 1; j > i - 10; j--) {
                    if (j < 0) break;
                    const obCandle = candles[j];
                    if (obCandle.close > obCandle.open) {
                        const obObj = {
                            time: obCandle.time,
                            type: 'Bearish Order Block',
                            low: obCandle.low,
                            high: obCandle.high,
                            whyItMatters: 'The last up-candle before a sharp bearish descent. Institutions loaded their short positions here, and their unfilled sell limit orders will act as resistance upon retest.',
                            strength: 'Strong',
                            probability: '82%',
                            potentialReaction: 'Expect price to sell off aggressively upon returning to test this block from below.'
                        };

                        // Check if breached
                        let breached = false;
                        for (let k = i + 1; k <= idx; k++) {
                            if (candles[k].close > obCandle.high) {
                                breached = true;
                                break;
                            }
                        }

                        if (breached) {
                            const sweptLiquidity = swings.highs.some(h => h.index < j && h.index > j - 10 && h.price > obCandle.high);
                            if (sweptLiquidity) {
                                breakerBlocks.push({
                                    ...obObj,
                                    type: 'Bearish Breaker Block',
                                    whyItMatters: 'A failed Bearish Order Block that swept buy-side liquidity before the structure break. Retesting from above flips this into a powerful bullish support.',
                                    potentialReaction: 'Expect price to find strong buying support and bounce upwards.'
                                });
                            } else {
                                mitigationBlocks.push({
                                    ...obObj,
                                    type: 'Bearish Mitigation Block',
                                    whyItMatters: 'A failed Bearish Order Block that did not sweep liquidity. Now serves as a bullish support level on retest.',
                                    potentialReaction: 'Expect price to find demand and bounce.'
                                });
                            }
                        } else {
                            orderBlocks.push(obObj);
                        }
                        break;
                    }
                }
            }
        }

        return { orderBlocks, breakerBlocks, mitigationBlocks };
    }

    /**
     * Detect Supply & Demand Zones
     */
    detectSupplyAndDemand(candles, swings) {
        const zones = [];
        const idx = candles.length - 1;
        const currentClose = candles[idx].close;

        // Demand Zone: A consolidation range near the lowest pivot lows
        if (swings.lows.length > 0) {
            const lowestSwingLow = swings.lows.reduce((min, l) => l.price < min.price ? l : min, swings.lows[0]);
            // Take the candle surrounding the lowest swing low
            const c = candles[lowestSwingLow.index];
            zones.push({
                type: 'Demand Zone',
                low: lowestSwingLow.price,
                high: Math.max(c.open, c.close),
                whyItMatters: 'Demand Zones represent institutional accumulation ranges near structural lows. When price falls into these cheap zones, smart money heavily bids to initiate markup phases.',
                strength: lowestSwingLow.price === Math.min(...candles.map(item => item.low)) ? 'Extreme' : 'Strong',
                probability: '85%',
                potentialReaction: 'Expect heavily compressed selling pressure, absorption of remaining sell orders, and a sharp upward rally.'
            });
        }

        // Supply Zone: A consolidation range near the highest pivot highs
        if (swings.highs.length > 0) {
            const highestSwingHigh = swings.highs.reduce((max, h) => h.price > max.price ? h : max, swings.highs[0]);
            const c = candles[highestSwingHigh.index];
            zones.push({
                type: 'Supply Zone',
                low: Math.min(c.open, c.close),
                high: highestSwingHigh.price,
                whyItMatters: 'Supply Zones represent institutional distribution coordinates. Near these expensive local highs, smart money distributes inventory, triggering heavy sells.',
                strength: highestSwingHigh.price === Math.max(...candles.map(item => item.high)) ? 'Extreme' : 'Strong',
                probability: '82%',
                potentialReaction: 'Expect immediate buying exhaustion, massive sell orders activation, and a rapid bearish drop.'
            });
        }

        return zones;
    }

    /**
     * Compute master Institutional Bias based on SMC indicators
     */
    calculateInstitutionalBias(currentPrice, eqh, eql, pools, sweepsAndStopHunts, blocks, fvgsResult, premiumDiscount) {
        let bullishPoints = 0;
        let bearishPoints = 0;

        // Premium/Discount Zone
        if (premiumDiscount.zone === 'Discount Zone') {
            bullishPoints += 3;
        } else if (premiumDiscount.zone === 'Premium Zone') {
            bearishPoints += 3;
        }

        // Sweeps & Stop Hunts (last 5 candles)
        const recentSweeps = sweepsAndStopHunts.sweeps;
        recentSweeps.forEach(s => {
            if (s.type.includes('Bullish')) bullishPoints += 4;
            if (s.type.includes('Bearish')) bearishPoints += 4;
        });

        // Unmitigated (active) blocks and FVGs
        const bullishBlocks = blocks.orderBlocks.filter(b => b.type.includes('Bullish'));
        const bearishBlocks = blocks.orderBlocks.filter(b => b.type.includes('Bearish'));
        const bullishFvgs = fvgsResult.fvgs.filter(f => f.type.includes('Bullish'));
        const bearishFvgs = fvgsResult.fvgs.filter(f => f.type.includes('Bearish'));

        // If price is near (within 1.5% of) active Order Blocks / FVGs
        bullishBlocks.forEach(b => {
            if (currentPrice > b.low && currentPrice < b.high * 1.015) {
                bullishPoints += 3; // resting demand
            }
        });

        bearishBlocks.forEach(b => {
            if (currentPrice < b.high && currentPrice > b.low * 0.985) {
                bearishPoints += 3; // resting supply
            }
        });

        // Compute final bias state
        let bias = 'Neutral Bias';
        let explanation = 'Smart money order flow is currently balanced. Institutional market participants are standing aside or consolidating inventory within standard range equilibrium. No major liquidity gaps or order block imbalances are actively targeted.';

        if (bullishPoints > bearishPoints + 2) {
            bias = 'Bullish Bias';
            explanation = `Smart money order flow is firmly Bullish. Institutions are actively accumulating positions within the Discount zone. Price has successfully swept Sell Side Liquidity (SSL) and resting stops below key equal lows, signaling a completed liquidity hunt. Rest retracement targets reside at unmitigated bullish order blocks, with price expected to push upwards toward buy side liquidity pools.`;
        } else if (bearishPoints > bullishPoints + 2) {
            bias = 'Bearish Bias';
            explanation = `Smart money order flow is heavily Bearish. Distribution is highly active within Premium price territories. A successful sweep of Buy Side Liquidity (BSL) has been executed, trapping breakout buyers near local swing highs. Price has broken key bullish structures, forming unmitigated bearish order blocks and fair value gaps above, paving the path downwards toward discount liquidity pools.`;
        }

        return {
            bias,
            explanation,
            bullishScore: bullishPoints,
            bearishScore: bearishPoints
        };
    }
}
