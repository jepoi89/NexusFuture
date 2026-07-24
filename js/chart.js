/**
 * TradingView Lightweight Charts Handler
 * Coordinates candlestick canvas drawing, indicator line overlays, patterns markers, and manual drawing tools.
 */

import {
    calculateEMA,
    calculateSMA,
    calculateBollingerBands,
    calculateSuperTrend,
    calculateParabolicSAR,
    calculateIchimoku
} from './indicators.js';

import { detectPatterns } from './patterns.js';

export class ChartManager {
    /**
     * @param {string} containerId - Element container ID
     */
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chart = null;
        this.candleSeries = null;
        this.volumeSeries = null;

        // Interactive drawing variables
        this.drawingMode = null; // 'trendline', 'horizontal', 'fib'
        this.drawingPoints = [];
        this.drawings = []; // array of { type, points, seriesObjects }

        // Color theme defaults (Dark mode)
        this.colors = {
            bg: '#181a20',
            grid: '#1f2229',
            text: '#848e9c',
            bull: '#0ecb81',
            bear: '#f6465d'
        };

        // Track active indicators
        this.indicatorSeries = {}; // map of key to line series object
        this.activeIndicators = {
            ema9: false,
            ema20: true, // defaults
            ema50: false,
            ema100: false,
            ema200: false,
            sma50: false,
            sma200: false,
            bb: false,
            supertrend: false,
            psar: false,
            ichimoku: false
        };

        // Track detected S/R, Supply/Demand, and Liquidity Zones
        this.zoneSeriesObjects = [];
        this.detectedZones = {
            support: null,
            resistance: null,
            demand: null,
            supply: null,
            liquidityHigh: null,
            liquidityLow: null
        };

        // Volume Profile tracking
        this.volumeProfile = {
            poc: 0,
            vah: 0,
            val: 0,
            bins: []
        };

        this.cachedCandles = [];
        this.initChart();
    }

    setTheme(isDark) {
        if (isDark) {
            this.colors = {
                bg: '#181a20',
                grid: '#1f2229',
                text: '#848e9c',
                bull: '#0ecb81',
                bear: '#f6465d'
            };
        } else {
            this.colors = {
                bg: '#ffffff',
                grid: '#f1f5f9',
                text: '#64748b',
                bull: '#0ecb81',
                bear: '#f6465d'
            };
        }

        if (this.chart) {
            this.chart.applyOptions({
                layout: {
                    background: { color: this.colors.bg },
                    textColor: this.colors.text
                },
                grid: {
                    vertLines: { color: this.colors.grid },
                    horzLines: { color: this.colors.grid }
                }
            });
        }
    }

    initChart() {
        if (!window.LightweightCharts) {
            console.error('LightweightCharts standalone CDN script is missing from window context.');
            return;
        }

        const chartOptions = {
            layout: {
                background: { color: this.colors.bg },
                textColor: this.colors.text,
                fontSize: 11,
                fontFamily: 'Inter, sans-serif'
            },
            grid: {
                vertLines: { color: this.colors.grid },
                horzLines: { color: this.colors.grid }
            },
            crosshair: {
                mode: window.LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: '#848e9c',
                    style: 3
                },
                crosshairMarkerVisible: false,
                horzLine: {
                    width: 1,
                    color: '#848e9c',
                    style: 3
                }
            },
            rightPriceScale: {
                borderColor: '#2b3139',
                autoScale: true
            },
            timeScale: {
                borderColor: '#2b3139',
                timeVisible: true,
                secondsVisible: false
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true
            }
        };

        this.chart = window.LightweightCharts.createChart(this.container, chartOptions);

        // Candlesticks
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: this.colors.bull,
            downColor: this.colors.bear,
            borderVisible: false,
            wickUpColor: this.colors.bull,
            wickDownColor: this.colors.bear
        });

        // Volume Pane (overlayed at bottom)
        this.volumeSeries = this.chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume'
            },
            priceScaleId: '', // overlay
            scaleMargins: {
                top: 0.8,
                bottom: 0
            }
        });

        // Set up Auto Resize
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].contentRect) return;
            const { width, height } = entries[0].contentRect;
            this.chart.resize(width, height);
        });
        resizeObserver.observe(this.container);

        // Bind interactive drawing triggers on click
        this.chart.subscribeClick((param) => this.handleChartClick(param));
    }

    /**
     * Render entire candlestick and volume history onto the chart
     * @param {Array<object>} candles - List of historical candles
     * @param {string} symbol - The symbol associated with the candles
     */
    setData(candles, symbol = '') {
        this.cachedCandles = candles;
        this.cachedCandles.symbol = symbol;
        
        // Dynamic price precision: 4 decimals for standard coins, 8 decimals for tiny coins (< 0.01)
        if (candles.length > 0) {
            const lastPrice = candles[candles.length - 1].close;
            const precision = lastPrice < 0.01 ? 8 : 4;
            const minMove = lastPrice < 0.01 ? 0.00000001 : 0.0001;
            this.candleSeries.applyOptions({
                priceFormat: {
                    type: 'price',
                    precision: precision,
                    minMove: minMove
                }
            });
        }

        // 1. Candlestick prices
        this.candleSeries.setData(candles);

        // 2. Volume candles mapping
        const volumeData = candles.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)'
        }));
        this.volumeSeries.setData(volumeData);

        // 3. Clear/Re-render overlays and drawings
        this.redrawIndicators();
        this.drawPatternMarkers();

        // 4. Run Smart Zones analysis & draw on chart
        this.detectAndDrawSmartZones();

        // 5. Compute and render Visible Range Volume Profile
        this.calculateAndDrawVolumeProfile();
    }

    /**
     * Stream incoming real-time single candlestick ticks
     * @param {object} candle - streaming live candle
     */
    updateData(candle) {
        this.candleSeries.update(candle);
        this.volumeSeries.update({
            time: candle.time,
            value: candle.volume,
            color: candle.close >= candle.open ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)'
        });

        // Update cache
        if (this.cachedCandles.length > 0) {
            const lastCached = this.cachedCandles[this.cachedCandles.length - 1];
            if (lastCached.time === candle.time) {
                this.cachedCandles[this.cachedCandles.length - 1] = candle;
            } else {
                this.cachedCandles.push(candle);
                if (this.cachedCandles.length > 1000) this.cachedCandles.shift();
            }
        }
    }

    setIndicatorActive(key, isActive) {
        if (this.activeIndicators[key] !== undefined) {
            this.activeIndicators[key] = isActive;
            this.redrawIndicators();
        }
    }

    /**
     * Redraws all indicators toggled on
     */
    redrawIndicators() {
        // Clear all previous indicator series
        Object.keys(this.indicatorSeries).forEach(key => {
            try {
                this.chart.removeSeries(this.indicatorSeries[key]);
            } catch (err) {}
        });
        this.indicatorSeries = {};

        const data = this.cachedCandles;
        if (data.length === 0) return;

        // Render EMA Overlays
        const renderLine = (key, values, color, lineWidth = 1) => {
            if (!this.activeIndicators[key]) return;
            const lineData = data.map((c, i) => ({
                time: c.time,
                value: values[i]
            })).filter(pt => pt.value !== null && pt.value !== undefined);

            const series = this.chart.addLineSeries({
                color,
                lineWidth,
                lineStyle: 0,
                crosshairMarkerVisible: false,
                priceLineVisible: false
            });
            series.setData(lineData);
            this.indicatorSeries[key] = series;
        };

        renderLine('ema9', calculateEMA(data, 9), '#3b82f6');
        renderLine('ema20', calculateEMA(data, 20), '#f59e0b');
        renderLine('ema50', calculateEMA(data, 50), '#10b981');
        renderLine('ema100', calculateEMA(data, 100), '#8b5cf6');
        renderLine('ema200', calculateEMA(data, 200), '#ef4444');

        renderLine('sma50', calculateSMA(data, 50), '#ec4899', 1.5);
        renderLine('sma200', calculateSMA(data, 200), '#06b6d4', 1.5);

        // Bollinger Bands (renders 3 distinct lines)
        if (this.activeIndicators.bb) {
            const bbResult = calculateBollingerBands(data, 20, 2);
            renderLine('bb_upper', bbResult.upper, 'rgba(168, 85, 247, 0.6)');
            renderLine('bb_middle', bbResult.middle, 'rgba(168, 85, 247, 0.4)', 1);
            renderLine('bb_lower', bbResult.lower, 'rgba(168, 85, 247, 0.6)');
        }

        // SuperTrend Overlay
        if (this.activeIndicators.supertrend) {
            const strend = calculateSuperTrend(data, 10, 3);
            const trendData = data.map((c, i) => {
                const isBullish = strend.trend[i] === 1;
                return {
                    time: c.time,
                    value: strend.supertrend[i],
                    color: isBullish ? '#0ecb81' : '#f6465d'
                };
            }).filter(pt => pt.value !== null && pt.value !== undefined);

            // Colored lines can be simulated by drawing line points
            const series = this.chart.addLineSeries({
                lineWidth: 2,
                priceLineVisible: false,
                crosshairMarkerVisible: false
            });
            series.setData(trendData.map(pt => ({ time: pt.time, value: pt.value })));
            this.indicatorSeries['supertrend'] = series;
        }

        // Parabolic SAR Overlay
        if (this.activeIndicators.psar) {
            const psarData = calculateParabolicSAR(data);
            const points = data.map((c, i) => ({
                time: c.time,
                value: psarData[i]
            })).filter(pt => pt.value !== null);

            // Draw as dotted points on line chart
            const series = this.chart.addLineSeries({
                color: '#f59e0b',
                lineWidth: 1,
                lineStyle: 3, // Dotted style
                crosshairMarkerVisible: false,
                priceLineVisible: false
            });
            series.setData(points);
            this.indicatorSeries['psar'] = series;
        }

        // Ichimoku Cloud Overlay
        if (this.activeIndicators.ichimoku) {
            const ichi = calculateIchimoku(data);
            renderLine('ichimoku_tenkan', ichi.tenkan, '#eab308');
            renderLine('ichimoku_kijun', ichi.kijun, '#2563eb');
            renderLine('ichimoku_senkouA', ichi.senkouA, '#22c55e');
            renderLine('ichimoku_senkouB', ichi.senkouB, '#ef4444');
        }
    }

    /**
     * Smart Support & Resistance Zone Detector
     * Computes S/R, Supply/Demand, and Liquidity zones and renders them as colored bands
     */
    detectAndDrawSmartZones() {
        const data = this.cachedCandles;
        if (data.length < 20) return;

        // Clear existing zone series
        this.zoneSeriesObjects.forEach(obj => {
            try { this.chart.removeSeries(obj); } catch (e) {}
        });
        this.zoneSeriesObjects = [];

        // Simple Local Peak / Valley finder
        let highest = -Infinity;
        let lowest = Infinity;
        let highestVolCandle = data[0];

        data.forEach(c => {
            if (c.high > highest) highest = c.high;
            if (c.low < lowest) lowest = c.low;
            if (c.volume > highestVolCandle.volume) highestVolCandle = c;
        });

        const currentPrice = data[data.length - 1].close;
        const priceRange = highest - lowest;

        // Zone 1: Support Zone (Green) near local lows
        const suppPivot = lowest + priceRange * 0.08;
        const suppTop = suppPivot * 1.004;
        const suppBottom = suppPivot * 0.996;

        // Zone 2: Resistance Zone (Red) near local highs
        const resPivot = highest - priceRange * 0.08;
        const resTop = resPivot * 1.004;
        const resBottom = resPivot * 0.996;

        // Zone 3: Demand Zone (Lower boundary of heavy accumulation)
        const demandPivot = lowest + priceRange * 0.02;
        const demandTop = demandPivot * 1.005;
        const demandBottom = demandPivot * 0.995;

        // Zone 4: Supply Zone (Upper boundary of heavy distribution)
        const supplyPivot = highest - priceRange * 0.02;
        const supplyTop = supplyPivot * 1.005;
        const supplyBottom = supplyPivot * 0.995;

        // Zone 5: Liquidity Zones (areas of clustered stop-loss hunting)
        const liqHigh = highest * 1.003;
        const liqLow = lowest * 0.997;

        // Count historical touches (price passing through boundaries)
        const countTouches = (level, pct = 0.005) => {
            let touches = 0;
            data.forEach(c => {
                if (c.low <= level * (1 + pct) && c.high >= level * (1 - pct)) {
                    touches++;
                }
            });
            return Math.max(1, touches);
        };

        const suppTouches = countTouches(suppPivot);
        const resTouches = countTouches(resPivot);

        // Zone conversions (resistance becomes support when broken)
        let suppStatus = "Holding";
        let resStatus = "Holding";

        if (currentPrice < suppBottom) {
            suppStatus = "Broken (Flipped to Resistance)";
        } else if (suppTouches > 5) {
            suppStatus = "Holding Strong";
        } else if (suppTouches > 3) {
            suppStatus = "Holding";
        } else {
            suppStatus = "Weakening";
        }

        if (currentPrice > resTop) {
            resStatus = "Broken (Flipped to Support)";
        } else if (resTouches > 5) {
            resStatus = "Holding Strong";
        } else if (resTouches > 3) {
            resStatus = "Holding";
        } else {
            resStatus = "Weakening";
        }

        // Compile Zone Metadata
        this.detectedZones = {
            support: {
                pivot: suppPivot,
                top: suppTop,
                bottom: suppBottom,
                touches: suppTouches,
                confidence: Math.min(98, 60 + suppTouches * 7),
                status: suppStatus,
                volConfirmation: highestVolCandle.close > highestVolCandle.open ? "High Confidence" : "Moderate",
                timeframeOrigin: "15m Chart"
            },
            resistance: {
                pivot: resPivot,
                top: resTop,
                bottom: resBottom,
                touches: resTouches,
                confidence: Math.min(98, 55 + resTouches * 8),
                status: resStatus,
                volConfirmation: highestVolCandle.close < highestVolCandle.open ? "High Confidence" : "Moderate",
                timeframeOrigin: "15m Chart"
            },
            demand: { pivot: demandPivot, top: demandTop, bottom: demandBottom },
            supply: { pivot: supplyPivot, top: supplyTop, bottom: supplyBottom },
            liquidityHigh: liqHigh,
            liquidityLow: liqLow
        };

        // Render S/R boundary lines on chart to represent the zones beautifully
        const drawZoneLine = (value, color, style = 2) => {
            const series = this.chart.addLineSeries({
                color,
                lineWidth: 1,
                lineStyle: style,
                priceLineVisible: false,
                crosshairMarkerVisible: false
            });
            const lineData = data.map(c => ({ time: c.time, value }));
            series.setData(lineData);
            this.zoneSeriesObjects.push(series);
        };

        // Support Zone borders (Green dashed)
        drawZoneLine(suppTop, 'rgba(14, 203, 129, 0.45)', 2);
        drawZoneLine(suppBottom, 'rgba(14, 203, 129, 0.45)', 2);

        // Resistance Zone borders (Red dashed)
        drawZoneLine(resTop, 'rgba(246, 70, 93, 0.45)', 2);
        drawZoneLine(resBottom, 'rgba(246, 70, 93, 0.45)', 2);

        // Demand Zone (Solid Green)
        drawZoneLine(demandPivot, 'rgba(14, 203, 129, 0.2)', 0);

        // Supply Zone (Solid Red)
        drawZoneLine(supplyPivot, 'rgba(246, 70, 93, 0.2)', 0);

        // Liquidity zones (Blue dotted)
        drawZoneLine(liqHigh, 'rgba(59, 130, 246, 0.4)', 3);
        drawZoneLine(liqLow, 'rgba(59, 130, 246, 0.4)', 3);
    }

    /**
     * Volume Profile Calculation & Rendering
     * Splits visible price range into discrete vertical bins and renders histogram on the right sidebar div.
     */
    calculateAndDrawVolumeProfile() {
        const data = this.cachedCandles;
        if (data.length < 10) return;

        // Identify Price boundaries
        let highest = -Infinity;
        let lowest = Infinity;
        data.forEach(c => {
            if (c.high > highest) highest = c.high;
            if (c.low < lowest) lowest = c.low;
        });

        // Generate 12 discrete price range bins
        const binCount = 12;
        const binSize = (highest - lowest) / binCount;
        const bins = Array.from({ length: binCount }, (_, i) => ({
            low: lowest + i * binSize,
            high: lowest + (i + 1) * binSize,
            volume: 0
        }));

        // Distribute volume into bins
        data.forEach(c => {
            const mid = (c.high + c.low + c.close) / 3;
            const binIdx = Math.min(binCount - 1, Math.floor((mid - lowest) / (binSize || 1)));
            if (binIdx >= 0 && binIdx < binCount) {
                bins[binIdx].volume += c.volume;
            }
        });

        // Find Point of Control (POC), High Volume Nodes (HVN), Low Volume Nodes (LVN)
        let maxVol = 0;
        let pocBinIdx = 0;
        bins.forEach((b, i) => {
            if (b.volume > maxVol) {
                maxVol = b.volume;
                pocBinIdx = i;
            }
        });

        const pocPrice = bins[pocBinIdx].low + binSize / 2;

        // Value Area (70% of total volume centered around POC)
        const totalVol = bins.reduce((sum, b) => sum + b.volume, 0);
        const targetValueAreaVol = totalVol * 0.70;

        let currentVaVol = bins[pocBinIdx].volume;
        let topIdx = pocBinIdx;
        let botIdx = pocBinIdx;

        while (currentVaVol < targetValueAreaVol && (topIdx < binCount - 1 || botIdx > 0)) {
            const topVol = topIdx < binCount - 1 ? bins[topIdx + 1].volume : 0;
            const botVol = botIdx > 0 ? bins[botIdx - 1].volume : 0;

            if (topVol >= botVol) {
                topIdx++;
                currentVaVol += topVol;
            } else {
                botIdx--;
                currentVaVol += botVol;
            }
        }

        const vahPrice = bins[topIdx].high;
        const valPrice = bins[botIdx].low;

        // Render Volume Profile bins onto HTML Panel overlaying beside the chart
        const profileDiv = document.getElementById('volumeProfileBars');
        if (profileDiv) {
            const mapBinHtml = bins.map((bin, i) => {
                const widthPercent = maxVol > 0 ? (bin.volume / maxVol) * 100 : 0;
                let bgClass = "bg-blue-500/20";
                let textBadge = "";

                if (i === pocBinIdx) {
                    bgClass = "bg-red-500/40 border-r-2 border-red-500";
                    textBadge = `<span class="text-[8px] bg-red-600 px-1 py-px rounded font-black text-black absolute left-1">POC</span>`;
                } else if (i >= botIdx && i <= topIdx) {
                    bgClass = "bg-amber-500/20 border-r border-amber-500/40";
                }

                return `
                    <div class="h-3 w-full relative flex items-center group cursor-pointer" title="Price: $${bin.low.toFixed(1)} - $${bin.high.toFixed(1)} | Vol: ${bin.volume.toFixed(1)}">
                        <div class="h-full ${bgClass} transition-all duration-300" style="width: ${widthPercent}%"></div>
                        ${textBadge}
                        <span class="absolute right-1 text-[8px] text-gray-500 font-mono hidden group-hover:block">$${bin.low.toFixed(0)}</span>
                    </div>
                `;
            }).reverse().join(''); // Render High prices on top, low on bottom

            profileDiv.innerHTML = mapBinHtml;

            // Draw flat line indicators for POC, VAH, VAL
            const pocIndicator = document.getElementById('pocLineIndicator');
            if (pocIndicator) {
                pocIndicator.classList.remove('hidden');
                // Calculate percentage height displacement
                const heightPercent = ((pocPrice - lowest) / (priceRange || 1)) * 100;
                pocIndicator.style.bottom = `${heightPercent}%`;
            }
        }

        this.volumeProfile = {
            poc: pocPrice,
            vah: vahPrice,
            val: valPrice,
            bins
        };
    }

    /**
     * Identifies candlestick patterns dynamically and places text markers on chart
     */
    drawPatternMarkers() {
        const data = this.cachedCandles;
        if (data.length === 0) return;

        const patterns = detectPatterns(data);
        const markers = [];

        // Focus on high conviction reversal patterns only for clean visual indicators
        const highConvictionPatterns = [
            'Bullish Engulfing', 'Bearish Engulfing',
            'Morning Star', 'Evening Star',
            'Hammer', 'Shooting Star', 'Pin Bar', 'Three White Soldiers', 'Three Black Crows'
        ];

        for (let i = 0; i < data.length; i++) {
            const pList = patterns[i];
            if (pList && pList.length > 0) {
                // Filter the patterns list for high conviction only
                const filteredPatterns = pList.filter(p => highConvictionPatterns.includes(p));
                if (filteredPatterns.length === 0) continue;

                const primaryPattern = filteredPatterns[0];
                
                const isBullish = [
                    'Hammer', 'Morning Star', 'Bullish Engulfing', 'Three White Soldiers', 'Pin Bar'
                ].includes(primaryPattern);

                markers.push({
                    time: data[i].time,
                    position: isBullish ? 'belowBar' : 'aboveBar',
                    color: isBullish ? '#0ecb81' : '#f6465d',
                    shape: isBullish ? 'arrowUp' : 'arrowDown',
                    text: primaryPattern,
                    size: 1
                });
            }
        }

        // To completely eliminate overlap and clutter, only take the most recent 4 markers
        const cleanMarkers = markers.slice(-4);

        this.candleSeries.setMarkers(cleanMarkers);
    }

    /**
     * Start manual drawing modes
     */
    startDrawingMode(mode) {
        this.drawingMode = mode;
        this.drawingPoints = [];
        console.log(`Manual tool activated: ${mode}. Please click on chart to anchor.`);
    }

    clearDrawings() {
        this.drawings.forEach(d => {
            d.seriesObjects.forEach(obj => {
                try {
                    this.chart.removeSeries(obj);
                } catch (err) {}
            });
        });
        this.drawings = [];
        this.drawingMode = null;
        this.drawingPoints = [];
    }

    /**
     * Handle manual click coordinates mapping
     */
    handleChartClick(param) {
        if (!this.drawingMode || !param || !param.time) return;

        // Extract approximate price from candlestick coordinate
        const price = param.seriesData.get(this.candleSeries);
        if (!price) return;

        const clickedPrice = price.close || price.value;
        const clickedTime = param.time;

        this.drawingPoints.push({ time: clickedTime, price: clickedPrice });

        // Logic check: do we have enough anchor points?
        if (this.drawingMode === 'horizontal') {
            // Horizontal lines require only one click
            this.createHorizontalLine(clickedPrice);
            this.drawingMode = null;
        } else if (this.drawingMode === 'trendline' && this.drawingPoints.length === 2) {
            this.createTrendLine(this.drawingPoints[0], this.drawingPoints[1]);
            this.drawingMode = null;
        } else if (this.drawingMode === 'fib' && this.drawingPoints.length === 2) {
            this.createFibonacciRetracement(this.drawingPoints[0].price, this.drawingPoints[1].price);
            this.drawingMode = null;
        }
    }

    createHorizontalLine(priceValue) {
        // Render a flat support/resistance line across whole time-scale
        const flatLine = this.chart.addLineSeries({
            color: '#38bdf8',
            lineWidth: 2,
            lineStyle: 2, // dashed
            priceLineVisible: false
        });

        const lineData = this.cachedCandles.map(c => ({
            time: c.time,
            value: priceValue
        }));

        flatLine.setData(lineData);
        this.drawings.push({
            type: 'horizontal',
            price: priceValue,
            seriesObjects: [flatLine]
        });
    }

    createTrendLine(pt1, pt2) {
        const trendLine = this.chart.addLineSeries({
            color: '#fbbf24',
            lineWidth: 2,
            priceLineVisible: false
        });

        // Interpolate linear coordinates between pt1 and pt2
        const t1 = typeof pt1.time === 'object' ? pt1.time.timestamp : pt1.time;
        const t2 = typeof pt2.time === 'object' ? pt2.time.timestamp : pt2.time;

        const linePoints = [];
        this.cachedCandles.forEach(c => {
            const ct = typeof c.time === 'object' ? c.time.timestamp : c.time;
            if (ct >= Math.min(t1, t2) && ct <= Math.max(t1, t2)) {
                // Linear equation: y = y1 + ((x - x1) * (y2 - y1) / (x2 - x1))
                const slope = (pt2.price - pt1.price) / (t2 - t1);
                const val = pt1.price + (ct - t1) * slope;
                linePoints.push({ time: c.time, value: val });
            }
        });

        trendLine.setData(linePoints);
        this.drawings.push({
            type: 'trendline',
            seriesObjects: [trendLine]
        });
    }

    createFibonacciRetracement(high, low) {
        const diff = high - low;
        const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const colors = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#2dd4bf', '#60a5fa', '#818cf8'];

        const seriesObjects = [];

        fibLevels.forEach((lvl, i) => {
            const price = high - lvl * diff;
            const line = this.chart.addLineSeries({
                color: colors[i],
                lineWidth: 1,
                lineStyle: 1,
                priceLineVisible: false
            });

            const lineData = this.cachedCandles.map(c => ({
                time: c.time,
                value: price
            }));

            line.setData(lineData);
            seriesObjects.push(line);
        });

        this.drawings.push({
            type: 'fib',
            seriesObjects
        });
    }
}
