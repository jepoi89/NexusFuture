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
     */
    setData(candles) {
        this.cachedCandles = candles;
        
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

        // Debounced or live refresh on overlays is too heavy, we stream update
        // but re-render markers and lines periodically (app controller handles)
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
     * Identifies candlestick patterns dynamically and places text markers on chart
     */
    drawPatternMarkers() {
        const data = this.cachedCandles;
        if (data.length === 0) return;

        const patterns = detectPatterns(data);
        const markers = [];

        for (let i = 0; i < data.length; i++) {
            const pList = patterns[i];
            if (pList && pList.length > 0) {
                // Focus on primary key patterns to avoid visual clutter
                const primaryPattern = pList[0];
                
                const isBullish = [
                    'Hammer', 'Morning Star', 'Bullish Engulfing', 'Three White Soldiers', 'Inside Bar'
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

        this.candleSeries.setMarkers(markers);
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
