/**
 * Core Application Controller for NEXUS Futures Dashboard
 * Ties index.html UI components together with historical data, live sockets, AI engine calculations, custom indicators, alerts, and drawings.
 */

import { BinanceAPI } from './api.js';
import { ChartManager } from './chart.js';
import { AIDecisionEngine } from './ai-engine.js';
import { RiskCalculator } from './risk.js';
import { AlertsManager } from './alerts.js';
import { formatPrice, formatPercent, formatVolume, debounce } from './utils.js';

// Default layout configurations
const POPULAR_WATCHLIST = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'DOGEUSDT', 
    'ADAUSDT', 'XRPUSDT', 'LINKUSDT', 'AVAXUSDT', 'SUIUSDT', 
    'SHIBUSDT', 'TRXUSDT'
];

class AppController {
    constructor() {
        this.binance = new BinanceAPI();
        this.chartManager = new ChartManager('chartDiv');
        this.aiEngine = new AIDecisionEngine();
        this.riskCalculator = new RiskCalculator();
        this.alerts = new AlertsManager();

        this.currentSymbol = 'BTCUSDT';
        this.currentTimeframe = '15m';
        this.isDarkMode = true;

        // Cached lists
        this.tickersCache = [];
        this.indicatorsCache = {};
        this.gaugeChartInstance = null;

        this.init();
    }

    async init() {
        // Initialize static icons first
        lucide.createIcons();

        // 1. Initialise UI Binding Events
        this.bindEvents();

        // 2. Load Watchlist side navigation panel
        await this.refreshWatchlist();

        // 3. Render main interactive charts
        await this.loadActiveSymbol(this.currentSymbol);

        // 4. Initialise custom interactive AI Score Gauge
        this.drawAiGauge(0);
    }

    bindEvents() {
        // Search Input & search suggestions dropdown
        const searchInput = document.getElementById('symbolSearchInput');
        searchInput.addEventListener('input', debounce(() => this.handleSearchInput(), 250));
        
        // Hide suggestions on outside click
        document.addEventListener('click', (e) => {
            if (e.target !== searchInput) {
                document.getElementById('searchResults').classList.add('hidden');
            }
        });

        // Timeframe selector buttons
        const tfContainer = document.getElementById('timeframeContainer');
        tfContainer.querySelectorAll('.timeframe-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                tfContainer.querySelectorAll('.timeframe-btn').forEach(b => {
                    b.classList.remove('bg-amber-500', 'text-black');
                    b.classList.add('hover:bg-gray-700', 'hover:text-white');
                });
                e.target.classList.add('bg-amber-500', 'text-black');
                e.target.classList.remove('hover:bg-gray-700', 'hover:text-white');
                
                const tf = e.target.getAttribute('data-timeframe');
                this.setTimeframe(tf);
            });
        });

        // Refresh Data Trigger
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadActiveSymbol(this.currentSymbol);
            this.refreshWatchlist();
        });

        // Interactive Drawing Tool Buttons
        document.getElementById('drawTrendlineBtn').addEventListener('click', () => {
            this.chartManager.startDrawingMode('trendline');
        });
        document.getElementById('drawHorizontalBtn').addEventListener('click', () => {
            this.chartManager.startDrawingMode('horizontal');
        });
        document.getElementById('drawFibBtn').addEventListener('click', () => {
            this.chartManager.startDrawingMode('fib');
        });
        document.getElementById('clearDrawingBtn').addEventListener('click', () => {
            this.chartManager.clearDrawings();
        });

        // Toggle Quick Indicators Overlay buttons
        document.getElementById('indicatorQuickToggles').querySelectorAll('.quick-ind-btn').forEach(btn => {
            const indKey = btn.getAttribute('data-ind');
            // set defaults matching constructor state
            if (this.chartManager.activeIndicators[indKey]) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', (e) => {
                const active = !e.target.classList.contains('active');
                if (active) {
                    e.target.classList.add('active');
                } else {
                    e.target.classList.remove('active');
                }
                this.chartManager.setIndicatorActive(indKey, active);
            });
        });

        // Alerts Modal Triggers
        const alertsModal = document.getElementById('alertsModal');
        document.getElementById('alertsModalTrigger').addEventListener('click', () => {
            alertsModal.classList.remove('hidden');
            this.renderAlertList();
        });
        document.getElementById('closeAlertsModalBtn').addEventListener('click', () => {
            alertsModal.classList.add('hidden');
        });
        document.getElementById('addAlertBtn').addEventListener('click', () => {
            this.handleAddAlert();
        });

        // Settings Modal Triggers
        const settingsModal = document.getElementById('settingsModal');
        document.getElementById('settingsBtn').addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
            this.loadSettingsModalState();
        });
        document.getElementById('closeSettingsModalBtn').addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
        document.getElementById('customIndicatorModalBtn').addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
            this.loadSettingsModalState();
        });
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettingsModalState();
            settingsModal.classList.add('hidden');
        });

        // Theme Toggle Button
        document.getElementById('themeToggleBtn').addEventListener('click', () => {
            this.isDarkMode = !this.isDarkMode;
            if (this.isDarkMode) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            this.chartManager.setTheme(this.isDarkMode);
        });

        // Bottom panel Tab Toggle
        document.querySelectorAll('.summary-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.summary-tab-btn').forEach(b => {
                    b.classList.remove('border-amber-500', 'text-amber-500');
                    b.classList.add('border-transparent', 'text-gray-400');
                });
                e.target.classList.add('border-amber-500', 'text-amber-500');
                e.target.classList.remove('border-transparent', 'text-gray-400');

                const targetTab = e.target.getAttribute('data-tab');
                document.getElementById('tabContentSentiment').classList.add('hidden');
                document.getElementById('tabContentSignals').classList.add('hidden');
                document.getElementById('tabContentHeatmap').classList.add('hidden');

                if (targetTab === 'sentiment') {
                    document.getElementById('tabContentSentiment').classList.remove('hidden');
                } else if (targetTab === 'signals') {
                    document.getElementById('tabContentSignals').classList.remove('hidden');
                } else if (targetTab === 'heatmap') {
                    document.getElementById('tabContentHeatmap').classList.remove('hidden');
                }
            });
        });

        // Register Global Connection statuses hooks
        window.updateConnectionStatus = (isConnected, statusMessage) => {
            const dot = document.getElementById('connectionStatusDot');
            const txt = document.getElementById('connectionStatusText');
            if (isConnected) {
                dot.classList.add('bg-green-500');
                dot.classList.remove('bg-red-500');
            } else {
                dot.classList.add('bg-red-500');
                dot.classList.remove('bg-green-500');
            }
            txt.textContent = statusMessage;
        };

        // Register Alert trigger logs
        window.onAlertTriggered = (alertLog) => {
            this.alerts.triggeredHistory.unshift(alertLog);
            this.renderSignalHistory();
            this.flashWatchlistBorder(alertLog.symbol);
            
            // Increment UI header badge
            const badge = document.getElementById('alertCountBadge');
            badge.classList.remove('hidden');
        };
    }

    /**
     * Load state of indicators into settings modal view checkbox
     */
    loadSettingsModalState() {
        const modal = document.getElementById('settingsModal');
        modal.querySelectorAll('.settings-ind-checkbox').forEach(box => {
            const indKey = box.getAttribute('data-settings-ind');
            box.checked = !!this.chartManager.activeIndicators[indKey];
        });
        document.getElementById('browserSoundToggle').checked = this.alerts.soundEnabled;
    }

    saveSettingsModalState() {
        const modal = document.getElementById('settingsModal');
        modal.querySelectorAll('.settings-ind-checkbox').forEach(box => {
            const indKey = box.getAttribute('data-settings-ind');
            this.chartManager.setIndicatorActive(indKey, box.checked);
        });
        this.alerts.setSoundEnabled(document.getElementById('browserSoundToggle').checked);

        // Map quick toggles to match new checked configurations
        document.getElementById('indicatorQuickToggles').querySelectorAll('.quick-ind-btn').forEach(btn => {
            const indKey = btn.getAttribute('data-ind');
            if (this.chartManager.activeIndicators[indKey]) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    /**
     * Autocomplete list search options
     */
    async handleSearchInput() {
        const input = document.getElementById('symbolSearchInput').value.trim().toUpperCase();
        const resultsDiv = document.getElementById('searchResults');
        
        if (!input) {
            resultsDiv.classList.add('hidden');
            return;
        }

        // Search within common high-cap futures / spot markets or load dynamic matched list
        const results = POPULAR_WATCHLIST.filter(pair => pair.includes(input));
        
        if (results.length === 0) {
            resultsDiv.innerHTML = `<div class="p-3 text-xs text-gray-500">No trading pairs matched</div>`;
        } else {
            resultsDiv.innerHTML = results.map(symbol => `
                <div class="px-3 py-2 text-xs text-gray-300 hover:bg-[#1e2329] hover:text-white cursor-pointer transition font-semibold" data-sym="${symbol}">
                    ⚡ ${symbol} (USDT Futures Contract)
                </div>
            `).join('');

            resultsDiv.querySelectorAll('[data-sym]').forEach(el => {
                el.addEventListener('click', () => {
                    const sym = el.getAttribute('data-sym');
                    this.loadActiveSymbol(sym);
                    resultsDiv.classList.add('hidden');
                    document.getElementById('symbolSearchInput').value = '';
                });
            });
        }
        resultsDiv.classList.remove('hidden');
    }

    /**
     * Swap current workspace context to chosen crypto symbol
     * @param {string} symbol - USDT based contract
     */
    async loadActiveSymbol(symbol) {
        this.currentSymbol = symbol.toUpperCase();
        console.log(`Swapping active viewport to: ${this.currentSymbol}`);

        // Update static UI text fields
        document.getElementById('currentSymbolTag').textContent = this.currentSymbol;
        document.getElementById('chartSymbol').textContent = this.currentSymbol;

        // Fetch Historical data
        const candles = await this.binance.fetchKlines(this.currentSymbol, this.currentTimeframe);
        
        if (candles.length === 0) {
            console.error('No historical candles returned for ' + this.currentSymbol);
            return;
        }

        // Render chart candles
        this.chartManager.setData(candles);

        // Run multi-timeframe evaluation
        await this.runMtfAnalysis();

        // Run custom AI analyst rules
        this.runAiEvaluation(candles);

        // Establish Stream connection
        this.binance.connectLiveStream(
            this.currentSymbol,
            this.currentTimeframe,
            // 1. Candle updates callback
            (tick) => {
                this.chartManager.updateData(tick);
                this.onLiveCandleTick(tick);
            },
            // 2. Watchlist dynamic rate tracker
            (ticker) => {
                this.onLiveTickerTick(ticker);
            }
        );
    }

    /**
     * Refresh active rates watchlist side pane
     */
    async refreshWatchlist() {
        const tickers = await this.binance.fetch24hTickers(POPULAR_WATCHLIST);
        this.tickersCache = tickers;
        this.renderWatchlist(tickers);
        this.renderHeatmap(tickers);
    }

    renderWatchlist(tickers) {
        const container = document.getElementById('watchlistContainer');
        if (tickers.length === 0) {
            container.innerHTML = `<div class="p-4 text-xs text-center text-gray-500">Error loading tickers. Check connection.</div>`;
            return;
        }

        container.innerHTML = tickers.map(item => {
            const isBullish = item.priceChangePercent >= 0;
            const changeColor = isBullish ? 'text-[#0ecb81]' : 'text-[#f6465d]';
            const changeSign = isBullish ? '+' : '';
            const volumeStr = formatVolume(item.quoteVolume);

            return `
                <div data-sym="${item.symbol}" class="flex items-center justify-between p-3.5 border-b border-gray-800/60 hover:bg-[#1e2329] cursor-pointer transition duration-150">
                    <div>
                        <div class="font-bold text-sm tracking-wide text-white">${item.symbol}</div>
                        <div class="text-[10px] text-gray-400">Vol: $${volumeStr}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-semibold text-xs tracking-wider" id="price-watchlist-${item.symbol}">${formatPrice(item.lastPrice)}</div>
                        <div class="text-[10px] font-bold ${changeColor}">${changeSign}${item.priceChangePercent.toFixed(2)}%</div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach click listeners to watchlist coins
        container.querySelectorAll('[data-sym]').forEach(card => {
            card.addEventListener('click', () => {
                const sym = card.getAttribute('data-sym');
                this.loadActiveSymbol(sym);
            });
        });
    }

    setTimeframe(tf) {
        this.currentTimeframe = tf;
        document.getElementById('chartInterval').textContent = tf;
        this.loadActiveSymbol(this.currentSymbol);
    }

    onLiveCandleTick(tick) {
        // Feed current ticks through AI evaluator
        const candles = [...this.chartManager.cachedCandles];
        this.runAiEvaluation(candles);

        // Update tags
        document.getElementById('currentPriceTag').textContent = formatPrice(tick.close);
        document.getElementById('chartSymbol').textContent = this.currentSymbol;
    }

    onLiveTickerTick(ticker) {
        const key = ticker.symbol.toUpperCase();
        if (key === this.currentSymbol) {
            // Update Top Tag
            const isBullish = ticker.changePercent >= 0;
            const colorClass = isBullish ? 'text-[#0ecb81]' : 'text-[#f6465d]';
            const tag = document.getElementById('currentChangeTag');
            tag.className = `font-bold text-xs ${colorClass}`;
            tag.textContent = `${isBullish ? '+' : ''}${ticker.changePercent.toFixed(2)}%`;
        }

        // Live Watchlist sync
        const priceLabel = document.getElementById(`price-watchlist-${key}`);
        if (priceLabel) {
            priceLabel.textContent = formatPrice(ticker.price);
        }
    }

    /**
     * Trigger Multi-Timeframe Background analyses
     */
    async runMtfAnalysis() {
        const tfs = ['5m', '15m', '1h', '4h', '1d'];
        const mtfData = {};

        for (const tf of tfs) {
            const data = await this.binance.fetchKlines(this.currentSymbol, tf, 100);
            mtfData[tf] = data;
        }

        const mtfResult = this.aiEngine.runMultiTimeframeAnalysis(mtfData);

        // Render indicators
        const colorMap = {
            'BULLISH': 'text-green-500',
            'BEARISH': 'text-red-500',
            'NEUTRAL': 'text-yellow-500'
        };

        document.getElementById('mtf5m').className = `font-black text-xs ${colorMap[mtfResult.timeframes['5m']] || 'text-gray-400'}`;
        document.getElementById('mtf5m').textContent = mtfResult.timeframes['5m'];

        document.getElementById('mtf15m').className = `font-black text-xs ${colorMap[mtfResult.timeframes['15m']] || 'text-gray-400'}`;
        document.getElementById('mtf15m').textContent = mtfResult.timeframes['15m'];

        document.getElementById('mtf1h').className = `font-black text-xs ${colorMap[mtfResult.timeframes['1h']] || 'text-gray-400'}`;
        document.getElementById('mtf1h').textContent = mtfResult.timeframes['1h'];

        document.getElementById('mtf4h').className = `font-black text-xs ${colorMap[mtfResult.timeframes['4h']] || 'text-gray-400'}`;
        document.getElementById('mtf4h').textContent = mtfResult.timeframes['4h'];

        document.getElementById('mtf1d').className = `font-black text-xs ${colorMap[mtfResult.timeframes['1d']] || 'text-gray-400'}`;
        document.getElementById('mtf1d').textContent = mtfResult.timeframes['1d'];
    }

    /**
     * Compile indicator calculations and execute decision trees
     * @param {Array<object>} candles 
     */
    runAiEvaluation(candles) {
        const decision = this.aiEngine.analyze(candles);

        // Update score texts
        document.getElementById('technicalScoreLabel').textContent = `${decision.score} / 100`;
        document.getElementById('gaugeScore').textContent = decision.score;
        document.getElementById('gaugeScoreText').textContent = decision.recommendation;

        // Animate AI gauge
        this.animateAiGauge(decision.score);

        // Build premium recommendation card
        const recCard = document.getElementById('aiRecCard');
        const recText = document.getElementById('aiRecText');
        const confidenceText = document.getElementById('aiConfidenceText');
        const confidenceBar = document.getElementById('aiConfidenceBar');

        recText.textContent = decision.recommendation;
        confidenceText.textContent = decision.confidence;
        confidenceBar.style.width = decision.confidence;

        // Visual effects for buy/sell
        recCard.className = 'p-3.5 rounded-lg border flex flex-col items-center justify-center text-center transition duration-300 ';
        if (decision.recommendation.includes('LONG')) {
            recCard.classList.add('bg-green-950/20', 'border-[#0ecb81]', 'text-[#0ecb81]', 'glow-green');
            confidenceBar.className = 'bg-[#0ecb81] h-full transition-all duration-500';
            document.getElementById('technicalRecommendationBadge').className = 'text-xs font-semibold px-2 py-0.5 rounded bg-green-500 text-white';
            document.getElementById('technicalRecommendationBadge').textContent = 'BUY';
        } else if (decision.recommendation.includes('SHORT')) {
            recCard.classList.add('bg-red-950/20', 'border-[#f6465d]', 'text-[#f6465d]', 'glow-red');
            confidenceBar.className = 'bg-[#f6465d] h-full transition-all duration-500';
            document.getElementById('technicalRecommendationBadge').className = 'text-xs font-semibold px-2 py-0.5 rounded bg-red-500 text-white';
            document.getElementById('technicalRecommendationBadge').textContent = 'SELL';
        } else {
            recCard.classList.add('bg-yellow-950/20', 'border-[#f0b90b]', 'text-[#f0b90b]', 'glow-yellow');
            confidenceBar.className = 'bg-[#f0b90b] h-full transition-all duration-500';
            document.getElementById('technicalRecommendationBadge').className = 'text-xs font-semibold px-2 py-0.5 rounded bg-yellow-500 text-black';
            document.getElementById('technicalRecommendationBadge').textContent = 'HOLD';
        }

        // Render reasoning explanation list
        const expContainer = document.getElementById('aiExplanationContainer');
        document.getElementById('reasoningCount').textContent = `${decision.agreement} Indicators Aligning`;

        expContainer.innerHTML = decision.reasons.map(reason => {
            const isBull = reason.startsWith('+');
            const icon = isBull ? 'check-circle' : 'alert-triangle';
            const colorClass = isBull ? 'text-green-500' : 'text-red-500';
            return `
                <li class="flex items-start space-x-2">
                    <span class="${colorClass} font-bold mr-1 text-[11px] select-none">${reason.split(' | ')[0]}</span>
                    <span class="text-gray-300 leading-snug">${reason.split(' | ')[1]}</span>
                </li>
            `;
        }).join('');

        // Sync and execute risk profile calculations
        const profile = this.riskCalculator.calculateProfile(candles, decision.recommendation);
        this.renderRiskManagement(profile);

        // Check user alerts for trigger matching
        const lastIndex = candles.length - 1;
        const currentClose = candles[lastIndex].close;
        
        // Extract recent technical crossovers for checkAlerts
        const technicalData = {
            rsi: decision.rsi,
            score: decision.score,
            confidence: parseInt(decision.confidence)
        };
        this.alerts.checkAlerts(this.currentSymbol, currentClose, technicalData);
    }

    renderRiskManagement(p) {
        document.getElementById('valPositionType').textContent = p.positionType;
        if (p.positionType === 'LONG') {
            document.getElementById('valPositionType').className = 'font-bold uppercase px-2 py-0.5 rounded text-[10px] bg-green-500 text-white';
        } else if (p.positionType === 'SHORT') {
            document.getElementById('valPositionType').className = 'font-bold uppercase px-2 py-0.5 rounded text-[10px] bg-red-500 text-white';
        } else {
            document.getElementById('valPositionType').className = 'font-bold uppercase px-2 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300';
        }

        document.getElementById('valEntryPrice').textContent = formatPrice(p.entryPrice);
        document.getElementById('valStopLoss').textContent = formatPrice(p.stopLoss);
        document.getElementById('valTp1').textContent = formatPrice(p.tp1);
        document.getElementById('valTp2').textContent = formatPrice(p.tp2);
        document.getElementById('valTp3').textContent = formatPrice(p.tp3);
        document.getElementById('valRiskReward').textContent = p.riskRewardRatio;
        document.getElementById('valLeverage').textContent = p.suggestedLeverage;

        const liqWarning = document.getElementById('valLiquidationWarning');
        if (p.highRiskWarning) {
            liqWarning.classList.remove('hidden');
        } else {
            liqWarning.classList.add('hidden');
        }
    }

    /**
     * Render the visual gauge utilizing premium HTML5 canvas
     */
    drawAiGauge(score) {
        const canvas = document.getElementById('aiGaugeCanvas');
        if (!canvas) return;

        // Clear or resize canvas appropriately
        const ctx = canvas.getContext('2d');
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height - 10;
        const radius = Math.min(width, height) - 15;

        // Draw Base arch (gray background)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI, false);
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#2b3139';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Draw active dynamic score arch segment
        // maps score scale from -100 to +100 to angular range (PI to 2*PI)
        const percent = (score + 100) / 200; // 0 to 1
        const endAngle = Math.PI + percent * Math.PI;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, Math.PI, endAngle, false);
        ctx.lineWidth = 14;

        // Dynamic color shifting gradient
        const gradient = ctx.createLinearGradient(0, cy, width, cy);
        gradient.addColorStop(0, '#f6465d'); // bearish red
        gradient.addColorStop(0.5, '#f0b90b'); // neutral yellow
        gradient.addColorStop(1, '#0ecb81'); // bullish green
        
        ctx.strokeStyle = gradient;
        ctx.stroke();

        // Draw dynamic floating selector dial needle pointer
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const needleX = cx + (radius - 5) * Math.cos(endAngle);
        const needleY = cy + (radius - 5) * Math.sin(endAngle);
        ctx.lineTo(needleX, needleY);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#eaecef';
        ctx.stroke();

        // center pin
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    animateAiGauge(targetScore) {
        let current = 0;
        const animationStep = () => {
            if (Math.abs(current - targetScore) < 2) {
                current = targetScore;
                this.drawAiGauge(current);
            } else {
                current += (targetScore - current) * 0.15;
                this.drawAiGauge(current);
                requestAnimationFrame(animationStep);
            }
        };
        animationStep();
    }

    /**
     * Alert Trigger UI handling
     */
    handleAddAlert() {
        const typeSelect = document.getElementById('alertTypeSelect');
        const triggerInput = document.getElementById('alertTriggerValueInput');
        
        const type = typeSelect.value;
        const targetValue = triggerInput.value.trim();

        if (type.includes('level') && !targetValue) {
            alert('Please specify an exact target boundary level price point for this alert');
            return;
        }

        const alertItem = this.alerts.addAlert(this.currentSymbol, type, targetValue);
        this.renderAlertList();
        triggerInput.value = '';

        // Flash badge
        console.log(`Alert trigger successfully added: ${alertItem.symbol} -> ${type}`);
    }

    renderAlertList() {
        const container = document.getElementById('activeAlertsList');
        const activeAlerts = this.alerts.getAlertsForSymbol(this.currentSymbol);

        if (activeAlerts.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-500 text-xs py-4">No active alerts set for ${this.currentSymbol}</div>`;
            return;
        }

        container.innerHTML = activeAlerts.map(alert => `
            <div class="bg-[#181a20] p-2.5 rounded border border-gray-800 flex justify-between items-center text-xs">
                <div>
                    <span class="font-bold text-white mr-1">${alert.symbol}</span>
                    <span class="text-amber-500 font-semibold">${alert.type.replace(/_/g, ' ').toUpperCase()}</span>
                    ${alert.targetValue ? `<span class="text-gray-400">@ ${alert.targetValue}</span>` : ''}
                </div>
                <button data-remove-alert="${alert.id}" class="text-red-500 hover:text-red-300 font-bold px-1 py-0.5 rounded bg-red-950/20 border border-red-950/30">Delete</button>
            </div>
        `).join('');

        container.querySelectorAll('[data-remove-alert]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-remove-alert');
                this.alerts.removeAlert(id);
                this.renderAlertList();
            });
        });
    }

    renderSignalHistory() {
        const container = document.getElementById('signalHistoryBody');
        if (this.alerts.triggeredHistory.length === 0) {
            container.innerHTML = `
                <tr class="border-b border-gray-800/50 text-gray-400">
                    <td class="py-3" colspan="7 text-center">No signal triggers yet. Active alerts display here on hit.</td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.alerts.triggeredHistory.map(log => `
            <tr class="border-b border-gray-800/50 hover:bg-[#1e2329] text-xs">
                <td class="py-3 text-gray-400 font-medium">${log.time}</td>
                <td class="py-3 font-bold text-white">${log.symbol}</td>
                <td class="py-3 text-red-400 font-semibold uppercase">ALERT TRIGGER</td>
                <td class="py-3 font-mono">${log.message}</td>
                <td class="py-3 text-gray-400 font-semibold">SUCCESS</td>
            </tr>
        `).join('');
    }

    renderHeatmap(tickers) {
        if (tickers.length === 0) return;

        // Sort by change percent (most bullish/bearish)
        const sortedChange = [...tickers].sort((a, b) => b.priceChangePercent - a.priceChangePercent);
        const sortedVol = [...tickers].sort((a, b) => b.quoteVolume - a.quoteVolume);

        const bullishDiv = document.getElementById('heatmapBullish');
        const bearishDiv = document.getElementById('heatmapBearish');
        const volDiv = document.getElementById('heatmapVolume');
        const volAtilityDiv = document.getElementById('heatmapVolatility');
        const trendingDiv = document.getElementById('heatmapTrending');

        const mapCoinRow = (item) => `
            <div class="flex justify-between items-center text-[11px] py-1 border-b border-gray-800/30 hover:bg-black/20 cursor-pointer" onclick="window.nexusLoadSymbol('${item.symbol}')">
                <span class="font-bold text-gray-300">${item.symbol}</span>
                <span class="font-bold ${item.priceChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}">${item.priceChangePercent >= 0 ? '+' : ''}${item.priceChangePercent.toFixed(1)}%</span>
            </div>
        `;

        bullishDiv.innerHTML = sortedChange.slice(0, 4).map(mapCoinRow).join('');
        bearishDiv.innerHTML = [...sortedChange].reverse().slice(0, 4).map(mapCoinRow).join('');
        volDiv.innerHTML = sortedVol.slice(0, 4).map(item => `
            <div class="flex justify-between items-center text-[11px] py-1 border-b border-gray-800/30 hover:bg-black/20 cursor-pointer" onclick="window.nexusLoadSymbol('${item.symbol}')">
                <span class="font-bold text-gray-300">${item.symbol}</span>
                <span class="font-medium text-blue-400">$${formatVolume(item.quoteVolume)}</span>
            </div>
        `).join('');

        // Volatility modeled approx by highPrice/lowPrice spread gap percentage
        const sortedVolatility = [...tickers].sort((a, b) => {
            const spreadA = a.lowPrice > 0 ? ((a.highPrice - a.lowPrice) / a.lowPrice) * 100 : 0;
            const spreadB = b.lowPrice > 0 ? ((b.highPrice - b.lowPrice) / b.lowPrice) * 100 : 0;
            return spreadB - spreadA;
        });

        volAtilityDiv.innerHTML = sortedVolatility.slice(0, 4).map(item => {
            const spread = item.lowPrice > 0 ? ((item.highPrice - item.lowPrice) / item.lowPrice) * 100 : 0;
            return `
                <div class="flex justify-between items-center text-[11px] py-1 border-b border-gray-800/30 hover:bg-black/20 cursor-pointer" onclick="window.nexusLoadSymbol('${item.symbol}')">
                    <span class="font-bold text-gray-300">${item.symbol}</span>
                    <span class="font-semibold text-purple-400">${spread.toFixed(1)}%</span>
                </div>
            `;
        }).join('');

        trendingDiv.innerHTML = sortedChange.slice(2, 6).map(mapCoinRow).join('');

        // Expose global click bridge for inline HTML attributes
        window.nexusLoadSymbol = (sym) => {
            this.loadActiveSymbol(sym);
        };
    }

    /**
     * Visual glow feedback on watchlist triggers
     */
    flashWatchlistBorder(symbol) {
        const item = document.querySelector(`[data-sym="${symbol}"]`);
        if (item) {
            item.classList.add('bg-amber-500/20', 'border-amber-500');
            setTimeout(() => {
                item.classList.remove('bg-amber-500/20', 'border-amber-500');
            }, 3000);
        }
    }
}

// Initialise core app entry point on DOM layout completion
window.addEventListener('DOMContentLoaded', () => {
    window.nexusApp = new AppController();
});
