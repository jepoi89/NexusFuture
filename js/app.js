/**
 * Upgraded Core Application Controller for NEXUS Futures Dashboard
 * Ties index.html UI components together with historical data, live sockets, AI Market Intelligence Engine, custom indicators, alerts, and drawings.
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

        // Cached lists and configurations
        this.tickersCache = [];
        this.cachedMtfData = null;
        this.currentNewsFeed = null;
        this.currentSentimentData = null;
        this.minAcceptableScore = 70; // User configurable threshold

        // Layout mode (compact, standard, pro)
        this.layoutMode = localStorage.getItem('nexus_layout_mode') || 'standard';

        // Favorite symbols mapping
        this.favorites = JSON.parse(localStorage.getItem('nexus_favorite_symbols') || '[]');
        this.showFavoritesOnly = false;

        // AI Trade Journal Storage
        this.journal = JSON.parse(localStorage.getItem('nexus_trade_journal') || '[]');

        this.init();
    }

    async init() {
        // Initialize static icons first
        lucide.createIcons();

        // Load correct visual layout modes
        this.applyWorkspaceLayout(this.layoutMode);

        // 1. Initialise UI Binding Events
        this.bindEvents();

        // 2. Load Watchlist side navigation panel
        try {
            await this.refreshWatchlist();
        } catch (err) {
            console.error("Failed to load watchlist during init:", err);
        }

        // 3. Render main interactive charts
        try {
            await this.loadActiveSymbol(this.currentSymbol);
        } catch (err) {
            console.error("Failed to load active symbol during init:", err);
        }

        // 4. Initialise custom interactive AI Score Gauge
        try {
            this.drawAiGauge(0);
        } catch (err) {
            console.error("Failed to draw initial AI gauge:", err);
        }

        // 5. Build Trade Journal Statistics lists
        this.renderJournalTable();

        // 6. Draw News list
        this.renderNewsArticles();

        // 7. Initialize Order Flow updates
        this.startOrderFlowSimulations();
    }

    bindEvents() {
        // Search Input & search suggestions dropdown
        const searchInput = document.getElementById('symbolSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => this.handleSearchInput(), 250));
        }
        
        // Hide suggestions on outside click
        document.addEventListener('click', (e) => {
            if (e.target !== searchInput) {
                const results = document.getElementById('searchResults');
                if (results) results.classList.add('hidden');
            }
        });

        // Configurable minimum trade quality score slider
        const minQualityInput = document.getElementById('minQualityScoreSelect');
        if (minQualityInput) {
            minQualityInput.addEventListener('input', (e) => {
                this.minAcceptableScore = parseInt(e.target.value);
                const label = document.getElementById('minQualityScoreLabel');
                if (label) label.textContent = `${this.minAcceptableScore}`;
                // Re-evaluate on current candles
                if (this.chartManager.cachedCandles.length > 0) {
                    this.runAiEvaluation(this.chartManager.cachedCandles);
                }
            });
        }

        // Timeframe selector buttons
        const tfContainer = document.getElementById('timeframeContainer');
        if (tfContainer) {
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
        }

        // Workspace View Selector layout binding
        const workspaceSelector = document.getElementById('workspaceViewSelector');
        if (workspaceSelector) {
            workspaceSelector.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    workspaceSelector.querySelectorAll('button').forEach(b => {
                        b.className = "px-2 py-1 rounded hover:text-white transition whitespace-nowrap";
                    });
                    e.target.className = "px-2 py-1 rounded bg-amber-500/10 text-amber-500 font-semibold border border-amber-500/20 whitespace-nowrap";
                    const chosenLayout = e.target.getAttribute('data-layout');
                    this.applyWorkspaceLayout(chosenLayout);
                });
            });
        }

        // Refresh Data Trigger
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadActiveSymbol(this.currentSymbol);
                this.refreshWatchlist();
            });
        }

        // Watchlist sorting selector
        const sortSelect = document.getElementById('watchlistSortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.renderWatchlist(this.tickersCache);
            });
        }

        // Favorites filter trigger toggle
        const favFilterBtn = document.getElementById('toggleFavoritesFilterBtn');
        if (favFilterBtn) {
            favFilterBtn.addEventListener('click', () => {
                this.showFavoritesOnly = !this.showFavoritesOnly;
                if (this.showFavoritesOnly) {
                    favFilterBtn.classList.remove('text-gray-400');
                    favFilterBtn.classList.add('text-yellow-500', 'bg-yellow-500/10');
                } else {
                    favFilterBtn.classList.remove('text-yellow-500', 'bg-yellow-500/10');
                    favFilterBtn.classList.add('text-gray-400');
                }
                this.renderWatchlist(this.tickersCache);
            });
        }

        // Position size calculator inputs key bindings
        ['calcAccountSize', 'calcRiskPct'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('input', () => {
                    this.recalculatePositionSize();
                });
            }
        });

        // Add trade setup manually to Journal
        const addJournalBtn = document.getElementById('addJournalSignalBtn');
        if (addJournalBtn) {
            addJournalBtn.addEventListener('click', () => {
                this.saveCurrentSetupToJournal();
            });
        }

        // News filter change events
        ['newsCategorySelect', 'newsImpactSelect'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    this.renderNewsArticles();
                });
            }
        });

        // Interactive Drawing Tool Buttons
        const drawTrendlineBtn = document.getElementById('drawTrendlineBtn');
        if (drawTrendlineBtn) {
            drawTrendlineBtn.addEventListener('click', () => {
                this.chartManager.startDrawingMode('trendline');
            });
        }
        const drawHorizontalBtn = document.getElementById('drawHorizontalBtn');
        if (drawHorizontalBtn) {
            drawHorizontalBtn.addEventListener('click', () => {
                this.chartManager.startDrawingMode('horizontal');
            });
        }
        const drawFibBtn = document.getElementById('drawFibBtn');
        if (drawFibBtn) {
            drawFibBtn.addEventListener('click', () => {
                this.chartManager.startDrawingMode('fib');
            });
        }
        const clearDrawingBtn = document.getElementById('clearDrawingBtn');
        if (clearDrawingBtn) {
            clearDrawingBtn.addEventListener('click', () => {
                this.chartManager.clearDrawings();
            });
        }

        // Toggle Quick Indicators Overlay buttons
        const indToggles = document.getElementById('indicatorQuickToggles');
        if (indToggles) {
            indToggles.querySelectorAll('.quick-ind-btn').forEach(btn => {
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
        }

        // Alerts Modal Triggers
        const alertsModal = document.getElementById('alertsModal');
        const alertTrigger = document.getElementById('alertsModalTrigger');
        if (alertTrigger) {
            alertTrigger.addEventListener('click', () => {
                if (alertsModal) alertsModal.classList.remove('hidden');
                this.renderAlertList();
            });
        }
        const closeAlertsBtn = document.getElementById('closeAlertsModalBtn');
        if (closeAlertsBtn) {
            closeAlertsBtn.addEventListener('click', () => {
                if (alertsModal) alertsModal.classList.add('hidden');
            });
        }
        const addAlertBtn = document.getElementById('addAlertBtn');
        if (addAlertBtn) {
            addAlertBtn.addEventListener('click', () => {
                this.handleAddAlert();
            });
        }

        // Settings Modal Triggers
        const settingsModal = document.getElementById('settingsModal');
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                if (settingsModal) settingsModal.classList.remove('hidden');
                this.loadSettingsModalState();
            });
        }
        const closeSettingsBtn = document.getElementById('closeSettingsModalBtn');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => {
                if (settingsModal) settingsModal.classList.add('hidden');
            });
        }
        const customIndBtn = document.getElementById('customIndicatorModalBtn');
        if (customIndBtn) {
            customIndBtn.addEventListener('click', () => {
                if (settingsModal) settingsModal.classList.remove('hidden');
                this.loadSettingsModalState();
            });
        }
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                this.saveSettingsModalState();
                if (settingsModal) settingsModal.classList.add('hidden');
            });
        }

        // Theme Toggle Button
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                this.isDarkMode = !this.isDarkMode;
                if (this.isDarkMode) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
                this.chartManager.setTheme(this.isDarkMode);
            });
        }

        // Keyboard Shortcuts hook
        document.addEventListener('keydown', (e) => {
            // ALT+S to search focus
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                document.getElementById('symbolSearchInput')?.focus();
            }
            // ALT+C to clear drawings
            if (e.altKey && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                this.chartManager.clearDrawings();
            }
        });

        // Custom Right Click Context Menu
        document.addEventListener('contextmenu', (e) => {
            const target = e.target;
            if (target.closest('#chartDiv')) {
                e.preventDefault();
                this.renderContextMenu(e.clientX, e.clientY);
            }
        });

        // Remove Context Menu on Left Click
        document.addEventListener('click', () => {
            const menu = document.getElementById('customContextMenu');
            if (menu) menu.remove();
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
                const tSentiment = document.getElementById('tabContentSentiment');
                const tSignals = document.getElementById('tabContentSignals');
                const tHeatmap = document.getElementById('tabContentHeatmap');
                const tOrderflow = document.getElementById('tabContentOrderflow');
                const tLiquidation = document.getElementById('tabContentLiquidation');
                const tNews = document.getElementById('tabContentNews');
                const tJournal = document.getElementById('tabContentJournal');

                if (tSentiment) tSentiment.classList.add('hidden');
                if (tSignals) tSignals.classList.add('hidden');
                if (tHeatmap) tHeatmap.classList.add('hidden');
                if (tOrderflow) tOrderflow.classList.add('hidden');
                if (tLiquidation) tLiquidation.classList.add('hidden');
                if (tNews) tNews.classList.add('hidden');
                if (tJournal) tJournal.classList.add('hidden');

                if (targetTab === 'sentiment' && tSentiment) {
                    tSentiment.classList.remove('hidden');
                } else if (targetTab === 'signals' && tSignals) {
                    tSignals.classList.remove('hidden');
                } else if (targetTab === 'heatmap' && tHeatmap) {
                    tHeatmap.classList.remove('hidden');
                } else if (targetTab === 'orderflow' && tOrderflow) {
                    tOrderflow.classList.remove('hidden');
                } else if (targetTab === 'liquidation' && tLiquidation) {
                    tLiquidation.classList.remove('hidden');
                } else if (targetTab === 'news' && tNews) {
                    tNews.classList.remove('hidden');
                } else if (targetTab === 'journal' && tJournal) {
                    tJournal.classList.remove('hidden');
                }
            });
        });

        // Register Global Connection statuses hooks
        window.updateConnectionStatus = (isConnected, statusMessage) => {
            const dot = document.getElementById('connectionStatusDot');
            const txt = document.getElementById('connectionStatusText');
            if (dot) {
                if (isConnected) {
                    dot.classList.add('bg-green-500');
                    dot.classList.remove('bg-red-500');
                } else {
                    dot.classList.add('bg-red-500');
                    dot.classList.remove('bg-green-500');
                }
            }
            if (txt) txt.textContent = statusMessage;
        };

        // Register Alert trigger logs
        window.onAlertTriggered = (alertLog) => {
            this.alerts.triggeredHistory.unshift(alertLog);
            this.renderSignalHistory();
            this.flashWatchlistBorder(alertLog.symbol);
            
            // Increment UI header badge
            const badge = document.getElementById('alertCountBadge');
            if (badge) badge.classList.remove('hidden');
        };

        // Wire up live slider value for S&R confidence threshold
        const srConfSelect = document.getElementById('srConfidenceSelect');
        const srConfValue = document.getElementById('srConfidenceValue');
        if (srConfSelect && srConfValue) {
            srConfSelect.addEventListener('input', (e) => {
                srConfValue.textContent = `${e.target.value}%`;
            });
        }
    }

    applyWorkspaceLayout(mode) {
        this.layoutMode = mode;
        localStorage.setItem('nexus_layout_mode', mode);

        const leftSidebar = document.getElementById('watchlistSidebar');
        const rightSidebar = document.querySelector('aside.w-80');
        const bottomTabHeaders = document.getElementById('bottomTabHeaders');

        if (mode === 'compact') {
            if (leftSidebar) leftSidebar.style.width = '200px';
            if (rightSidebar) rightSidebar.style.width = '240px';
        } else if (mode === 'pro') {
            if (leftSidebar) leftSidebar.style.width = '340px';
            if (rightSidebar) rightSidebar.style.width = '360px';
        } else {
            // standard
            if (leftSidebar) leftSidebar.style.width = '280px';
            if (rightSidebar) rightSidebar.style.width = '320px';
        }
    }

    renderContextMenu(x, y) {
        const oldMenu = document.getElementById('customContextMenu');
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'customContextMenu';
        menu.className = "fixed bg-[#181a20] border border-gray-700 rounded shadow-2xl p-2 z-50 text-xs w-48 space-y-1 font-semibold text-[#eaecef]";
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        menu.innerHTML = `
            <div class="px-3 py-1.5 hover:bg-gray-800 rounded cursor-pointer text-gray-300 hover:text-white" onclick="window.nexusApp.chartManager.startDrawingMode('trendline')">⚡ Trendline Tool</div>
            <div class="px-3 py-1.5 hover:bg-gray-800 rounded cursor-pointer text-gray-300 hover:text-white" onclick="window.nexusApp.chartManager.startDrawingMode('horizontal')">⚡ Support/Resistance Line</div>
            <div class="px-3 py-1.5 hover:bg-gray-800 rounded cursor-pointer text-gray-300 hover:text-white" onclick="window.nexusApp.chartManager.startDrawingMode('fib')">⚡ Fibonacci Retracements</div>
            <div class="border-t border-gray-800 my-1"></div>
            <div class="px-3 py-1.5 hover:bg-red-950 rounded cursor-pointer text-red-400 hover:text-red-200" onclick="window.nexusApp.chartManager.clearDrawings()">❌ Clear All Drawings</div>
        `;
        document.body.appendChild(menu);
    }

    /**
     * Load state of indicators into settings modal view checkbox
     */
    loadSettingsModalState() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.querySelectorAll('.settings-ind-checkbox').forEach(box => {
                const indKey = box.getAttribute('data-settings-ind');
                box.checked = !!this.chartManager.activeIndicators[indKey];
            });
        }
        const toggle = document.getElementById('browserSoundToggle');
        if (toggle) toggle.checked = this.alerts.soundEnabled;

        // Load S&R options state
        const tSR = document.getElementById('toggleSR');
        if (tSR) tSR.checked = this.srSettings.drawSR;
        const tSD = document.getElementById('toggleSD');
        if (tSD) tSD.checked = this.srSettings.drawSD;
        const tSRLabels = document.getElementById('toggleSRLabels');
        if (tSRLabels) tSRLabels.checked = this.srSettings.drawSRLabels;
        const sens = document.getElementById('srSensitivitySelect');
        if (sens) sens.value = this.srSettings.sensitivity;
        const conf = document.getElementById('srConfidenceSelect');
        if (conf) {
            conf.value = this.srSettings.minConfidence;
            const valSpan = document.getElementById('srConfidenceValue');
            if (valSpan) valSpan.textContent = `${this.srSettings.minConfidence}%`;
        }
    }

    saveSettingsModalState() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.querySelectorAll('.settings-ind-checkbox').forEach(box => {
                const indKey = box.getAttribute('data-settings-ind');
                this.chartManager.setIndicatorActive(indKey, box.checked);
            });
        }
        const toggle = document.getElementById('browserSoundToggle');
        if (toggle) this.alerts.setSoundEnabled(toggle.checked);

        // Save S&R options state
        const tSR = document.getElementById('toggleSR');
        if (tSR) this.srSettings.drawSR = tSR.checked;
        const tSD = document.getElementById('toggleSD');
        if (tSD) this.srSettings.drawSD = tSD.checked;
        const tSRLabels = document.getElementById('toggleSRLabels');
        if (tSRLabels) this.srSettings.drawSRLabels = tSRLabels.checked;
        const sens = document.getElementById('srSensitivitySelect');
        if (sens) this.srSettings.sensitivity = sens.value;
        const conf = document.getElementById('srConfidenceSelect');
        if (conf) this.srSettings.minConfidence = parseInt(conf.value) || 80;

        // Re-evaluate on current candles to apply updated S&R settings immediately
        if (this.chartManager.cachedCandles.length > 0) {
            this.runAiEvaluation(this.chartManager.cachedCandles);
        }

        // Map quick toggles to match new checked configurations
        const indToggles = document.getElementById('indicatorQuickToggles');
        if (indToggles) {
            indToggles.querySelectorAll('.quick-ind-btn').forEach(btn => {
                const indKey = btn.getAttribute('data-ind');
                if (this.chartManager.activeIndicators[indKey]) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

    /**
     * Autocomplete list search options
     */
    async handleSearchInput() {
        const input = document.getElementById('symbolSearchInput').value.trim().toUpperCase();
        const resultsDiv = document.getElementById('searchResults');
        
        if (!input) {
            if (resultsDiv) resultsDiv.classList.add('hidden');
            return;
        }

        const results = POPULAR_WATCHLIST.filter(pair => pair.includes(input));
        
        if (resultsDiv) {
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
    }

    /**
     * Swap current workspace context to chosen crypto symbol
     * @param {string} symbol - USDT based contract
     */
    async loadActiveSymbol(symbol) {
        this.currentSymbol = symbol.toUpperCase();
        console.log(`Swapping active viewport to: ${this.currentSymbol}`);

        // Update static UI text fields
        const tag = document.getElementById('currentSymbolTag');
        if (tag) tag.textContent = this.currentSymbol;
        const chartSym = document.getElementById('chartSymbol');
        if (chartSym) chartSym.textContent = this.currentSymbol;

        // Generate dynamic feeds for news & sentiment
        this.currentNewsFeed = this.generateNewsFeed(this.currentSymbol);
        this.currentSentimentData = this.generateSentimentData(this.currentSymbol);

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

        // Run Market Intelligence evaluation
        this.runAiEvaluation(candles);

        // Populate S/R prices in upper summary bar
        const zones = this.chartManager.detectedZones;
        if (zones && zones.support && zones.resistance) {
            const topSupp = document.getElementById('topSupportPrice');
            const topRes = document.getElementById('topResistancePrice');
            if (topSupp) topSupp.textContent = `$${zones.support.pivot.toFixed(2)}`;
            if (topRes) topRes.textContent = `$${zones.resistance.pivot.toFixed(2)}`;

            const suppConf = document.getElementById('suppZoneConf');
            const resConf = document.getElementById('resZoneConf');
            if (suppConf) suppConf.textContent = `${zones.support.confidence}%`;
            if (resConf) resConf.textContent = `${zones.resistance.confidence}%`;

            const suppSt = document.getElementById('suppZoneStatus');
            const resSt = document.getElementById('resZoneStatus');
            if (suppSt) suppSt.textContent = `${zones.support.status} (${zones.support.touches} Touch)`;
            if (resSt) resSt.textContent = `${zones.resistance.status} (${zones.resistance.touches} Touch)`;
        }

        // Populate Liquidation panel values
        const lastCandle = candles[candles.length - 1];
        const liqLongs = document.getElementById('liqLongs');
        const liqShorts = document.getElementById('liqShorts');
        const liqHighCluster = document.getElementById('liqHighCluster');
        const liqBullHunt = document.getElementById('liqBullHunt');
        const liqBearHunt = document.getElementById('liqBearHunt');

        if (liqLongs) liqLongs.textContent = `$${formatVolume(lastCandle.volume * lastCandle.close * 0.08)}`;
        if (liqShorts) liqShorts.textContent = `$${formatVolume(lastCandle.volume * lastCandle.close * 0.05)}`;
        if (liqHighCluster) liqHighCluster.textContent = `$${(lastCandle.close * 0.985).toFixed(2)}`;
        if (liqBullHunt) liqBullHunt.textContent = `$${(lastCandle.close * 0.991).toFixed(2)}`;
        if (liqBearHunt) liqBearHunt.textContent = `$${(lastCandle.close * 1.009).toFixed(2)}`;

        // Establish Stream connection
        this.binance.connectLiveStream(
            this.currentSymbol,
            this.currentTimeframe,
            (tick) => {
                this.chartManager.updateData(tick);
                this.onLiveCandleTick(tick);
            },
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
        if (!container) return;

        if (tickers.length === 0) {
            container.innerHTML = `<div class="p-4 text-xs text-center text-gray-500">Error loading tickers. Check connection.</div>`;
            return;
        }

        let rendered = [...tickers];

        // Filter by Favorites
        if (this.showFavoritesOnly) {
            rendered = rendered.filter(item => this.favorites.includes(item.symbol));
        }

        // Apply Sorting Select value
        const sortVal = document.getElementById('watchlistSortSelect')?.value || 'volume';
        if (sortVal === 'volume') {
            rendered.sort((a, b) => b.quoteVolume - a.quoteVolume);
        } else if (sortVal === 'volatility') {
            rendered.sort((a, b) => {
                const spreadA = a.lowPrice > 0 ? ((a.highPrice - a.lowPrice) / a.lowPrice) * 100 : 0;
                const spreadB = b.lowPrice > 0 ? ((b.highPrice - b.lowPrice) / b.lowPrice) * 100 : 0;
                return spreadB - spreadA;
            });
        } else if (sortVal === 'ai_score') {
            // Simulated AI Score sort weight based on symbol characters
            rendered.sort((a, b) => (b.symbol.charCodeAt(1) % 50) - (a.symbol.charCodeAt(1) % 50));
        } else if (sortVal === 'bull_prob') {
            rendered.sort((a, b) => (b.symbol.charCodeAt(0) % 100) - (a.symbol.charCodeAt(0) % 100));
        } else if (sortVal === 'market_cap') {
            rendered.sort((a, b) => b.lastPrice * 1e7 - a.lastPrice * 1e7);
        } else if (sortVal === 'alphabetical') {
            rendered.sort((a, b) => a.symbol.localeCompare(b.symbol));
        }

        container.innerHTML = rendered.map(item => {
            const isBullish = item.priceChangePercent >= 0;
            const changeColor = isBullish ? 'text-[#0ecb81]' : 'text-[#f6465d]';
            const changeSign = isBullish ? '+' : '';
            const volumeStr = formatVolume(item.quoteVolume);
            const isFav = this.favorites.includes(item.symbol);

            return `
                <div data-sym="${item.symbol}" class="flex items-center justify-between p-3 border-b border-gray-800/60 hover:bg-[#1e2329] cursor-pointer transition duration-150 relative">
                    <div class="flex items-center space-x-2">
                        <button class="favorite-star-btn text-gray-500 hover:text-yellow-500 transition" data-fav-sym="${item.symbol}">
                            <i data-lucide="star" class="w-3.5 h-3.5 ${isFav ? 'text-yellow-500 fill-yellow-500' : ''}"></i>
                        </button>
                        <div>
                            <div class="font-bold text-xs tracking-wide text-white">${item.symbol}</div>
                            <div class="text-[9px] text-gray-400">Vol: $${volumeStr}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-semibold text-xs tracking-wider" id="price-watchlist-${item.symbol}">${formatPrice(item.lastPrice)}</div>
                        <div class="text-[9px] font-bold ${changeColor}">${changeSign}${item.priceChangePercent.toFixed(2)}%</div>
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();

        // Bind clicks to swap assets
        container.querySelectorAll('[data-sym]').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.favorite-star-btn')) return;
                const sym = card.getAttribute('data-sym');
                this.loadActiveSymbol(sym);
            });
        });

        // Bind clicks to favorite stars
        container.querySelectorAll('[data-fav-sym]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sym = btn.getAttribute('data-fav-sym');
                this.toggleFavoriteSymbol(sym);
            });
        });
    }

    toggleFavoriteSymbol(symbol) {
        if (this.favorites.includes(symbol)) {
            this.favorites = this.favorites.filter(s => s !== symbol);
        } else {
            this.favorites.push(symbol);
        }
        localStorage.setItem('nexus_favorite_symbols', JSON.stringify(this.favorites));
        this.renderWatchlist(this.tickersCache);
    }

    setTimeframe(tf) {
        this.currentTimeframe = tf;
        const interval = document.getElementById('chartInterval');
        if (interval) interval.textContent = tf;
        this.loadActiveSymbol(this.currentSymbol);
    }

    onLiveCandleTick(tick) {
        const candles = [...this.chartManager.cachedCandles];
        this.runAiEvaluation(candles);

        // Update tags
        const prTag = document.getElementById('currentPriceTag');
        if (prTag) prTag.textContent = formatPrice(tick.close);
        const chartSym = document.getElementById('chartSymbol');
        if (chartSym) chartSym.textContent = this.currentSymbol;
    }

    onLiveTickerTick(ticker) {
        const key = ticker.symbol.toUpperCase();
        if (key === this.currentSymbol) {
            const isBullish = ticker.changePercent >= 0;
            const colorClass = isBullish ? 'text-[#0ecb81]' : 'text-[#f6465d]';
            const tag = document.getElementById('currentChangeTag');
            if (tag) {
                tag.className = `font-bold text-xs ${colorClass}`;
                tag.textContent = `${isBullish ? '+' : ''}${ticker.changePercent.toFixed(2)}%`;
            }

            // Update top system header values
            const highEl = document.getElementById('top24hHigh');
            const lowEl = document.getElementById('top24hLow');
            const volEl = document.getElementById('top24hVol');
            if (highEl) highEl.textContent = formatPrice(ticker.price * 1.03);
            if (lowEl) lowEl.textContent = formatPrice(ticker.price * 0.97);
            if (volEl) volEl.textContent = `$${formatVolume(ticker.volume * ticker.price)}`;
        }

        const priceLabel = document.getElementById(`price-watchlist-${key}`);
        if (priceLabel) {
            priceLabel.textContent = formatPrice(ticker.price);
        }
    }

    /**
     * Trigger Multi-Timeframe Background analyses
     */
    async runMtfAnalysis() {
        const tfs = ['1m', '5m', '15m', '1h', '4h', '1d'];
        const mtfData = {};

        for (const tf of tfs) {
            const data = await this.binance.fetchKlines(this.currentSymbol, tf, 100);
            mtfData[tf] = data;
        }

        this.cachedMtfData = mtfData;

        const mtfResult = this.aiEngine.runMultiTimeframeAnalysis(mtfData);

        const colorMap = {
            'BULLISH': 'text-green-500',
            'BEARISH': 'text-red-500',
            'NEUTRAL': 'text-yellow-500'
        };

        const setTfBadge = (id, tfKey) => {
            const el = document.getElementById(id);
            if (el) {
                const tfResult = mtfResult.timeframes[tfKey] || 'NEUTRAL';
                el.className = `font-black text-xs ${colorMap[tfResult] || 'text-gray-400'}`;
                el.textContent = tfResult;
            }
        };

        setTfBadge('mtf5m', '5m');
        setTfBadge('mtf15m', '15m');
        setTfBadge('mtf1h', '1h');
        setTfBadge('mtf4h', '4h');
        setTfBadge('mtf1d', '1d');
    }

    /**
     * Compile indicator calculations and execute Market Intelligence decision trees
     * @param {Array<object>} candles 
     */
    runAiEvaluation(candles) {
        const mtf = this.cachedMtfData;
        const news = this.currentNewsFeed || this.generateNewsFeed(this.currentSymbol);
        const sentiment = this.currentSentimentData || this.generateSentimentData(this.currentSymbol);
        const minQuality = this.minAcceptableScore;

        const decision = this.aiEngine.analyze(candles, mtf, news, sentiment, minQuality);

        // Update score texts
        const techScoreLabel = document.getElementById('technicalScoreLabel');
        if (techScoreLabel) techScoreLabel.textContent = `${decision.score} / 100`;
        const gaugeScore = document.getElementById('gaugeScore');
        if (gaugeScore) gaugeScore.textContent = decision.score;
        const gaugeScoreText = document.getElementById('gaugeScoreText');
        if (gaugeScoreText) gaugeScoreText.textContent = decision.recommendation;

        // Animate AI gauge
        this.animateAiGauge(decision.score);

        // Build premium recommendation card
        const recCard = document.getElementById('aiRecCard');
        const recText = document.getElementById('aiRecText');
        const confidenceText = document.getElementById('aiConfidenceText');
        const confidenceBar = document.getElementById('aiConfidenceBar');

        if (recText) recText.textContent = decision.recommendation;
        if (confidenceText) confidenceText.textContent = decision.confidence;
        if (confidenceBar) confidenceBar.style.width = decision.confidence;

        // Visual effects for buy/sell
        if (recCard) {
            recCard.className = 'p-3.5 rounded-lg border flex flex-col items-center justify-center text-center transition duration-300 ';
            if (decision.recommendation.includes('LONG') || decision.recommendation === 'Strong Long' || decision.recommendation === 'Long') {
                recCard.classList.add('bg-green-950/20', 'border-[#0ecb81]', 'text-[#0ecb81]', 'glow-green');
                if (confidenceBar) confidenceBar.className = 'bg-[#0ecb81] h-full transition-all duration-500';
                const techRecBadge = document.getElementById('technicalRecommendationBadge');
                if (techRecBadge) {
                    techRecBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-green-500 text-white';
                    techRecBadge.textContent = 'BUY';
                }
            } else if (decision.recommendation.includes('SHORT') || decision.recommendation === 'Strong Short' || decision.recommendation === 'Short') {
                recCard.classList.add('bg-red-950/20', 'border-[#f6465d]', 'text-[#f6465d]', 'glow-red');
                if (confidenceBar) confidenceBar.className = 'bg-[#f6465d] h-full transition-all duration-500';
                const techRecBadge = document.getElementById('technicalRecommendationBadge');
                if (techRecBadge) {
                    techRecBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-red-500 text-white';
                    techRecBadge.textContent = 'SELL';
                }
            } else {
                recCard.classList.add('bg-yellow-950/20', 'border-[#f0b90b]', 'text-[#f0b90b]', 'glow-yellow');
                if (confidenceBar) confidenceBar.className = 'bg-[#f0b90b] h-full transition-all duration-500';
                const techRecBadge = document.getElementById('technicalRecommendationBadge');
                if (techRecBadge) {
                    techRecBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-yellow-500 text-black';
                    techRecBadge.textContent = 'HOLD';
                }
            }
        }

        // Render reasoning explanation list
        const expContainer = document.getElementById('aiExplanationContainer');
        const reasonCountEl = document.getElementById('reasoningCount');
        if (reasonCountEl) {
            reasonCountEl.textContent = `${decision.reasons.length} Factors Aligning`;
        }

        if (expContainer) {
            expContainer.innerHTML = decision.reasons.map(reason => {
                return `
                    <li class="flex items-start space-x-2">
                        <span class="text-amber-500 font-bold mr-1 text-[11px] select-none">✔</span>
                        <span class="text-gray-300 leading-snug">${reason}</span>
                    </li>
                `;
            }).join('');
        }

        // Invalidation statement upgrade
        const invalidationEl = document.getElementById('aiInvalidationText');
        if (invalidationEl) {
            invalidationEl.textContent = decision.recommendation.includes('Long') ?
                `Bullish setup invalidates immediately on a 15-minute candle closing below the recent demand swing low boundary support line at $${decision.layers.marketStructure.swingLow.toFixed(2)} with high volume.` :
                `Bearish setup invalidates immediately on a 15-minute candle closing above the recent resistance swing high boundary level at $${decision.layers.marketStructure.swingHigh.toFixed(2)} on expanding buying activity.`;
        }

        // Expected Move estimation metrics
        const curAtr = decision.layers.volatility.atr;
        const expPrice = document.getElementById('expPriceMove');
        const expVol = document.getElementById('expVolatility');
        const expDur = document.getElementById('expDuration');
        if (expPrice) expPrice.textContent = `±$${(curAtr * 1.5).toFixed(1)}`;
        if (expVol) expVol.textContent = `${decision.layers.volatility.rating}`;
        if (expDur) expDur.textContent = `${decision.layers.volatility.rating.includes('High') ? '1.5 Hours' : '6 Hours'}`;

        // Render Probabilities
        this.renderProbabilities(decision.probabilities);

        // Render Layer Findings
        this.renderLayerDetails(decision.layers);

        // Sync and execute risk profile calculations
        this.renderRiskManagement(decision.tradePlan, decision.tradeQuality, decision.tradeQualityRating, decision.trendStrength, decision.volatilityRating, decision.riskLevel);

        // Check user alerts for trigger matching
        const lastIndex = candles.length - 1;
        const currentClose = candles[lastIndex].close;
        const technicalData = {
            rsi: candles[lastIndex].close, // fallback
            score: decision.score,
            confidence: parseInt(decision.confidence)
        };
        this.alerts.checkAlerts(this.currentSymbol, currentClose, technicalData);
    }

    renderProbabilities(probs) {
        const bullBar = document.getElementById('probBullishBar');
        const bearBar = document.getElementById('probBearishBar');
        const neutBar = document.getElementById('probNeutralBar');

        const bullText = document.getElementById('probBullishText');
        const bearText = document.getElementById('probBearishText');
        const neutText = document.getElementById('probNeutralText');

        if (bullBar && bearBar && neutBar) {
            bullBar.style.width = `${probs.bullish}%`;
            bearBar.style.width = `${probs.bearish}%`;
            neutBar.style.width = `${probs.neutral}%`;
        }

        if (bullText && bearText && neutText) {
            bullText.textContent = `${probs.bullish}%`;
            bearText.textContent = `${probs.bearish}%`;
            neutText.textContent = `${probs.neutral}%`;
        }
    }

    renderLayerDetails(layers) {
        const mStructure = document.getElementById('layerMarketStructureText');
        if (mStructure) {
            mStructure.innerHTML = `
                <span class="font-bold block text-amber-500">${layers.marketStructure.bias || 'Sideways'}</span>
                <span class="text-[11px] text-gray-400 block mt-0.5">Condition: ${layers.marketStructure.condition || 'Consolidation'}</span>
                <span class="text-[11px] text-gray-400 block">S-High: $${layers.marketStructure.swingHigh?.toFixed(2) || '--'} | S-Low: $${layers.marketStructure.swingLow?.toFixed(2) || '--'}</span>
                <div class="mt-1 flex flex-wrap gap-1 text-[9px]">
                    ${layers.marketStructure.bos ? '<span class="bg-green-950/40 text-green-400 border border-green-800 px-1 rounded font-bold">BOS</span>' : ''}
                    ${layers.marketStructure.choch ? '<span class="bg-yellow-950/40 text-yellow-400 border border-yellow-800 px-1 rounded font-bold">CHoCH</span>' : ''}
                    ${layers.marketStructure.liquiditySweep ? '<span class="bg-blue-950/40 text-blue-400 border border-blue-800 px-1 rounded font-bold">SWEEP</span>' : ''}
                </div>
            `;
        }

        const pAction = document.getElementById('layerPriceActionText');
        if (pAction) {
            pAction.innerHTML = `
                <span class="font-bold block text-blue-400">${layers.priceAction.patternsDetected?.join(', ') || 'No distinct patterns'}</span>
                <span class="text-[11px] text-gray-400 block mt-0.5">Breakout: ${layers.priceAction.breakoutProb}% | Fake: ${layers.priceAction.fakeBreakoutProb}%</span>
                <span class="text-[11px] text-gray-400 block">Reversal: ${layers.priceAction.reversalProb}% | S/R: $${layers.priceAction.support?.toFixed(1) || '--'} / $${layers.priceAction.resistance?.toFixed(1) || '--'}</span>
            `;
        }

        const volText = document.getElementById('layerVolumeText');
        if (volText) {
            volText.innerHTML = `
                <span class="font-bold block text-purple-400 font-semibold">Flow: ${layers.volume.confirmation || 'Stable'}</span>
                <span class="text-[11px] text-gray-400 block mt-0.5">RVOL: ${layers.volume.rvol?.toFixed(2) || '1.00'}x | Trend: ${layers.volume.volumeTrend || 'Stable'}</span>
                <span class="text-[11px] text-gray-400 block">State: ${layers.volume.obvTrend || 'Neutral'}</span>
            `;
        }

        const momText = document.getElementById('layerMomentumText');
        if (momText) {
            momText.innerHTML = `
                <span class="font-bold block text-cyan-400">Rating: ${layers.momentum.rating || 'Neutral'}</span>
                <span class="text-[11px] text-gray-400 block mt-0.5">Divergence: ${layers.momentum.divergence || 'None'}</span>
                <span class="text-[11px] text-gray-400 block">Shift: ${layers.momentum.shift || 'None'}</span>
            `;
        }

        const volatilityText = document.getElementById('layerVolatilityText');
        if (volatilityText) {
            volatilityText.innerHTML = `
                <span class="font-bold block text-indigo-400">Suitability: ${layers.volatility.suitability || 'Balanced'}</span>
                <span class="text-[11px] text-gray-400 block mt-0.5">HV: ${layers.volatility.hv?.toFixed(1) || '0'}% | BBW: ${(layers.volatility.bbw * 100)?.toFixed(1) || '0'}%</span>
                <span class="text-[11px] text-gray-400 block">ATR: ${layers.volatility.atr?.toFixed(2) || '0'}</span>
            `;
        }

        const newsContainer = document.getElementById('layerNewsText');
        if (newsContainer) {
            newsContainer.innerHTML = `
                <span class="font-bold text-amber-500 block">Category: ${layers.news.category}</span>
                <span class="block italic text-gray-300 leading-tight mt-0.5 text-[11px]">"${layers.news.headline}"</span>
                <span class="text-[10px] text-gray-400 block mt-0.5">Impact: ${layers.news.influence > 0 ? '+' : ''}${layers.news.influence}% | Source: ${layers.news.credibility}</span>
            `;
        }

        const sentimentContainer = document.getElementById('layerSentimentText');
        if (sentimentContainer) {
            sentimentContainer.innerHTML = `
                <span class="font-bold block text-green-400">${layers.sentiment.reasons[0] || 'Neutral Sentiment'}</span>
                <span class="text-[11px] text-gray-400 block mt-0.5">Fear vs Greed Equivalent: ${layers.sentiment.score}/100</span>
            `;
        }
    }

    renderRiskManagement(tp, quality, rating, strength, volatility, risk) {
        const posType = document.getElementById('valPositionType');
        if (posType) posType.textContent = this.currentSymbol;
        const entryPrice = document.getElementById('valEntryPrice');
        if (entryPrice) entryPrice.textContent = tp.entryZone || '--';
        const stopLoss = document.getElementById('valStopLoss');
        if (stopLoss) stopLoss.textContent = typeof tp.stopLoss === 'number' && tp.stopLoss > 0 ? `$${tp.stopLoss.toFixed(2)}` : '--';
        const tp1 = document.getElementById('valTp1');
        if (tp1) tp1.textContent = typeof tp.tp1 === 'number' && tp.tp1 > 0 ? `$${tp.tp1.toFixed(2)}` : '--';
        const tp2 = document.getElementById('valTp2');
        if (tp2) tp2.textContent = typeof tp.tp2 === 'number' && tp.tp2 > 0 ? `$${tp.tp2.toFixed(2)}` : '--';
        const tp3 = document.getElementById('valTp3');
        if (tp3) tp3.textContent = typeof tp.tp3 === 'number' && tp.tp3 > 0 ? `$${tp.tp3.toFixed(2)}` : '--';
        const riskReward = document.getElementById('valRiskReward');
        if (riskReward) riskReward.textContent = tp.riskRewardRatio || '--';

        // Additional Trade planner fields
        const invalidationEl = document.getElementById('valInvalidation');
        if (invalidationEl) {
            invalidationEl.textContent = typeof tp.stopLoss === 'number' && tp.stopLoss > 0 ? `$${(tp.stopLoss * 0.992).toFixed(2)}` : '--';
        }

        const triggerLabel = document.getElementById('valConfirmationTrigger');
        if (triggerLabel) triggerLabel.textContent = tp.confirmationTrigger || '--';

        const ratingColorMap = {
            'Exceptional': 'text-green-400 border-green-800 bg-green-950/30',
            'High Probability': 'text-emerald-400 border-emerald-800 bg-emerald-950/30',
            'Good Setup': 'text-teal-400 border-teal-800 bg-teal-950/30',
            'Average': 'text-yellow-400 border-yellow-800 bg-yellow-950/30',
            'Weak': 'text-orange-400 border-orange-800 bg-orange-950/30',
            'Avoid Trade': 'text-red-400 border-red-800 bg-red-950/30'
        };

        const ratingBadge = document.getElementById('valTradeQualityBadge');
        if (ratingBadge) {
            ratingBadge.textContent = `${quality}/100 — ${rating}`;
            ratingBadge.className = `px-2 py-0.5 rounded border text-[11px] font-bold ${ratingColorMap[rating] || 'text-gray-400'}`;
        }

        const strengthLabel = document.getElementById('valTrendStrength');
        if (strengthLabel) strengthLabel.textContent = strength || '--';

        const volLabel = document.getElementById('valVolatilityRating');
        if (volLabel) volLabel.textContent = volatility || '--';

        const riskLabel = document.getElementById('valRiskLevel');
        if (riskLabel) {
            riskLabel.textContent = risk || '--';
            if (risk === 'High' || risk === 'Extreme') {
                riskLabel.className = 'font-bold text-red-500';
            } else {
                riskLabel.className = 'font-bold text-green-500';
            }
        }

        // Recalculate size from suggestions
        this.recalculatePositionSize();
    }

    /**
     * Position Size Calculator Formula:
     * Position Size = Account Balance * Risk Percentage / (Distance to Stop Loss)
     */
    recalculatePositionSize() {
        const accountVal = parseFloat(document.getElementById('calcAccountSize')?.value || 10000);
        const riskPct = parseFloat(document.getElementById('calcRiskPct')?.value || 2.0);

        const activeSetupPrice = this.chartManager.cachedCandles.length > 0 ? this.chartManager.cachedCandles[this.chartManager.cachedCandles.length - 1].close : 0;
        const slPriceText = document.getElementById('valStopLoss')?.textContent.replace('$', '');
        const slPrice = parseFloat(slPriceText || 0);

        const sizeLabel = document.getElementById('valPositionSize');
        const maxLossLabel = document.getElementById('valMaxLoss');

        if (!activeSetupPrice || !slPrice || isNaN(accountVal) || isNaN(riskPct)) {
            if (sizeLabel) sizeLabel.textContent = "--";
            return;
        }

        const maxLoss = accountVal * (riskPct / 100);
        if (maxLossLabel) maxLossLabel.textContent = `$${maxLoss.toFixed(2)}`;

        const stopDistancePct = Math.abs(activeSetupPrice - slPrice) / activeSetupPrice;
        if (stopDistancePct === 0) return;

        const contractsSize = maxLoss / (Math.abs(activeSetupPrice - slPrice));
        const totalNotional = contractsSize * activeSetupPrice;

        if (sizeLabel) {
            sizeLabel.textContent = `${contractsSize.toFixed(3)} ${this.currentSymbol.replace('USDT', '')} ($${totalNotional.toFixed(2)})`;
        }
    }

    /**
     * News and Sentiment Generative Feeds
     */
    generateNewsFeed(symbol) {
        const coin = symbol.replace('USDT', '');
        const newsItems = [
            {
                headline: `${coin} institutional investment spikes as spot ETFs see massive daily inflows.`,
                impactScore: 40,
                credibility: 'Bloomberg Terminal',
                recency: '15m ago',
                category: 'ETF News'
            },
            {
                headline: `Regulatory framework approved for crypto derivatives, bolstering market liquidity.`,
                impactScore: 55,
                credibility: 'Reuters Financial',
                recency: '45m ago',
                category: 'Regulation'
            },
            {
                headline: `Whales accumulate $150M worth of ${coin} over the past 48 hours.`,
                impactScore: 35,
                credibility: 'Glassnode Alerts',
                recency: '2h ago',
                category: 'Whale Activity'
            },
            {
                headline: `New protocol upgrade scheduled for next month; expected to increase transaction throughput.`,
                impactScore: 20,
                credibility: 'Core Dev Release',
                recency: '4h ago',
                category: 'Network Upgrade'
            },
            {
                headline: `Short-term futures liquidations hit $80M amidst sudden leverage squeeze.`,
                impactScore: -15,
                credibility: 'Coinglass Feed',
                recency: '1h ago',
                category: 'Macroeconomic Events'
            }
        ];
        const index = (symbol.length + new Date().getMinutes()) % newsItems.length;
        return newsItems[index];
    }

    generateSentimentData(symbol) {
        const score = 55 + (symbol.charCodeAt(0) % 25);
        let label = 'Greed';
        if (score > 75) label = 'Extreme Greed';
        else if (score < 45) label = 'Fear';

        return {
            value: score,
            label: label,
            fundingRate: 0.01 + (symbol.charCodeAt(1) % 10) * 0.005,
            openInterest: 1.2e9 + (symbol.charCodeAt(2) % 15) * 5e7
        };
    }

    /**
     * Render the visual gauge utilizing premium HTML5 canvas
     */
    drawAiGauge(score) {
        const canvas = document.getElementById('aiGaugeCanvas');
        if (!canvas) return;

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

        ctx.beginPath();
        ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI, false);
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#2b3139';
        ctx.lineCap = 'round';
        ctx.stroke();

        const percent = (score + 100) / 200;
        const endAngle = Math.PI + percent * Math.PI;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, Math.PI, endAngle, false);
        ctx.lineWidth = 14;

        const gradient = ctx.createLinearGradient(0, cy, width, cy);
        gradient.addColorStop(0, '#f6465d');
        gradient.addColorStop(0.5, '#f0b90b');
        gradient.addColorStop(1, '#0ecb81');
        
        ctx.strokeStyle = gradient;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const needleX = cx + (radius - 5) * Math.cos(endAngle);
        const needleY = cy + (radius - 5) * Math.sin(endAngle);
        ctx.lineTo(needleX, needleY);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#eaecef';
        ctx.stroke();

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
        
        const type = typeSelect ? typeSelect.value : '';
        const targetValue = triggerInput ? triggerInput.value.trim() : '';

        if (type.includes('level') && !targetValue) {
            alert('Please specify an exact target boundary level price point for this alert');
            return;
        }

        const alertItem = this.alerts.addAlert(this.currentSymbol, type, targetValue);
        this.renderAlertList();
        if (triggerInput) triggerInput.value = '';

        console.log(`Alert trigger successfully added: ${alertItem.symbol} -> ${type}`);
    }

    renderAlertList() {
        const container = document.getElementById('activeAlertsList');
        if (container) {
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
    }

    renderSignalHistory() {
        const container = document.getElementById('signalHistoryBody');
        if (container) {
            if (this.alerts.triggeredHistory.length === 0) {
                container.innerHTML = `
                    <tr class="border-b border-gray-800/50 text-gray-400">
                        <td class="p-3 text-center" colspan="7">No signal triggers yet. Active alerts display here on hit.</td>
                    </tr>
                `;
                return;
            }

            container.innerHTML = this.alerts.triggeredHistory.map(log => `
                <tr class="border-b border-gray-800/50 hover:bg-[#1e2329] text-xs">
                    <td class="p-3 text-gray-400 font-medium">${log.time}</td>
                    <td class="p-3 font-bold text-white">${log.symbol}</td>
                    <td class="p-3 text-red-400 font-semibold uppercase">ALERT TRIGGER</td>
                    <td class="p-3 font-mono">${log.message}</td>
                    <td class="p-3 text-gray-400 font-semibold">SUCCESS</td>
                </tr>
            `).join('');
        }
    }

    renderHeatmap(tickers) {
        if (tickers.length === 0) return;

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

        if (bullishDiv) bullishDiv.innerHTML = sortedChange.slice(0, 4).map(mapCoinRow).join('');
        if (bearishDiv) bearishDiv.innerHTML = [...sortedChange].reverse().slice(0, 4).map(mapCoinRow).join('');
        if (volDiv) {
            volDiv.innerHTML = sortedVol.slice(0, 4).map(item => `
                <div class="flex justify-between items-center text-[11px] py-1 border-b border-gray-800/30 hover:bg-black/20 cursor-pointer" onclick="window.nexusLoadSymbol('${item.symbol}')">
                    <span class="font-bold text-gray-300">${item.symbol}</span>
                    <span class="font-medium text-blue-400">$${formatVolume(item.quoteVolume)}</span>
                </div>
            `).join('');
        }

        const sortedVolatility = [...tickers].sort((a, b) => {
            const spreadA = a.lowPrice > 0 ? ((a.highPrice - a.lowPrice) / a.lowPrice) * 100 : 0;
            const spreadB = b.lowPrice > 0 ? ((b.highPrice - b.lowPrice) / b.lowPrice) * 100 : 0;
            return spreadB - spreadA;
        });

        if (volAtilityDiv) {
            volAtilityDiv.innerHTML = sortedVolatility.slice(0, 4).map(item => {
                const spread = item.lowPrice > 0 ? ((item.highPrice - item.lowPrice) / item.lowPrice) * 100 : 0;
                return `
                    <div class="flex justify-between items-center text-[11px] py-1 border-b border-gray-800/30 hover:bg-black/20 cursor-pointer" onclick="window.nexusLoadSymbol('${item.symbol}')">
                        <span class="font-bold text-gray-300">${item.symbol}</span>
                        <span class="font-semibold text-purple-400">${spread.toFixed(1)}%</span>
                    </div>
                `;
            }).join('');
        }

        if (trendingDiv) trendingDiv.innerHTML = sortedChange.slice(2, 6).map(mapCoinRow).join('');

        window.nexusLoadSymbol = (sym) => {
            this.loadActiveSymbol(sym);
        };
    }

    flashWatchlistBorder(symbol) {
        const item = document.querySelector(`[data-sym="${symbol}"]`);
        if (item) {
            item.classList.add('bg-amber-500/20', 'border-amber-500');
            setTimeout(() => {
                item.classList.remove('bg-amber-500/20', 'border-amber-500');
            }, 3000);
        }
    }

    /**
     * Simulated Order Flow real-time activity
     */
    startOrderFlowSimulations() {
        setInterval(() => {
            const currentClose = this.chartManager.cachedCandles.length > 0 ? this.chartManager.cachedCandles[this.chartManager.cachedCandles.length - 1].close : 95000;
            const spread = 0.05 + Math.random() * 0.45;

            // Generate Bids / Asks
            const asksList = document.getElementById('orderBookAsks');
            const bidsList = document.getElementById('orderBookBids');
            const spreadEl = document.getElementById('ofSpread');

            if (spreadEl) spreadEl.textContent = spread.toFixed(2);

            const mapOrder = (price, colorClass) => `
                <div class="flex justify-between ${colorClass}">
                    <span class="price font-semibold">${price.toFixed(2)}</span>
                    <span class="amount font-medium">${(0.1 + Math.random() * 6).toFixed(3)}</span>
                </div>
            `;

            if (asksList) {
                asksList.innerHTML = [1, 2, 3].map(i => {
                    return mapOrder(currentClose + spread + i * (Math.random() * 1.5), 'text-red-400');
                }).reverse().join('');
            }

            if (bidsList) {
                bidsList.innerHTML = [1, 2, 3].map(i => {
                    return mapOrder(currentClose - spread - i * (Math.random() * 1.5), 'text-green-400');
                }).join('');
            }

            // Updates Imbalance Bars
            const bidsPct = 40 + Math.round(Math.random() * 20);
            const asksPct = 100 - bidsPct;

            const bidsPctText = document.getElementById('ofBidsPct');
            const asksPctText = document.getElementById('ofAsksPct');
            const bidsPctBar = document.getElementById('ofBidsBar');
            const asksPctBar = document.getElementById('ofAsksBar');

            if (bidsPctText) bidsPctText.textContent = `${bidsPct}%`;
            if (asksPctText) asksPctText.textContent = `${asksPct}%`;
            if (bidsPctBar) bidsPctBar.style.width = `${bidsPct}%`;
            if (asksPctBar) asksPctBar.style.width = `${asksPct}%`;

            // Random big block trades
            if (Math.random() > 0.6) {
                const largeTracker = document.getElementById('largeTradesTracker');
                if (largeTracker) {
                    const isBuy = Math.random() > 0.48;
                    const amount = (5 + Math.random() * 35);
                    const notional = amount * currentClose;
                    const timeStr = new Date().toLocaleTimeString();
                    const colorClass = isBuy ? "text-green-400" : "text-red-400";
                    const actStr = isBuy ? "BUY" : "SELL";

                    const tradeHtml = `<div class="flex justify-between ${colorClass}"><span class="time">${timeStr}</span><span>${actStr} ${amount.toFixed(2)} ${this.currentSymbol.replace('USDT', '')} ($${formatVolume(notional)})</span></div>`;
                    largeTracker.insertAdjacentHTML('afterbegin', tradeHtml);

                    if (largeTracker.children.length > 10) {
                        largeTracker.lastElementChild.remove();
                    }
                }
            }
        }, 1500);
    }

    /**
     * AI Trade Journal Local Database management
     */
    saveCurrentSetupToJournal() {
        const recText = document.getElementById('aiRecText')?.textContent || "WAIT";
        if (recText === "WAIT" || recText === "Avoid Trade") {
            alert("No actionable trade setup exists at this time. Change settings or select another asset.");
            return;
        }

        const currentPrice = this.chartManager.cachedCandles.length > 0 ? this.chartManager.cachedCandles[this.chartManager.cachedCandles.length - 1].close : 0;
        const entryText = document.getElementById('valEntryPrice')?.textContent || currentPrice.toString();
        const stopLossText = document.getElementById('valStopLoss')?.textContent || "0";
        const tp1Text = document.getElementById('valTp1')?.textContent || "0";

        const reasonEl = document.getElementById('aiExplanationContainer')?.firstElementChild;
        const firstReason = reasonEl ? reasonEl.textContent.trim() : "Technical alignment indicators";

        const logEntry = {
            id: Date.now().toString(),
            date: new Date().toLocaleDateString(),
            coin: this.currentSymbol,
            timeframe: this.currentTimeframe,
            recommendation: recText,
            confidence: document.getElementById('aiConfidenceText')?.textContent || "0%",
            quality: document.getElementById('valTradeQualityBadge')?.textContent.split(' ')[0] || "70",
            reason: firstReason,
            entry: entryText,
            stopLoss: stopLossText,
            targets: tp1Text,
            outcome: "OPEN" // Win, Loss, Open
        };

        this.journal.unshift(logEntry);
        localStorage.setItem('nexus_trade_journal', JSON.stringify(this.journal));
        this.renderJournalTable();
        alert(`Successfully logged ${this.currentSymbol} setup into local AI Trade Journal!`);
    }

    renderJournalTable() {
        const tableBody = document.getElementById('journalTableBody');
        if (!tableBody) return;

        if (this.journal.length === 0) {
            tableBody.innerHTML = `
                <tr class="border-b border-gray-800/50 text-gray-400">
                    <td class="p-4 text-center font-semibold" colspan="8">No logged setups saved yet. Click 'Save Trade Setup to Journal' on trade planner side.</td>
                </tr>
            `;
            return;
        }

        // Calculate Stats
        const totalTrades = this.journal.length;
        const closedTrades = this.journal.filter(t => t.outcome !== 'OPEN');
        const winTrades = this.journal.filter(t => t.outcome === 'WIN');
        const winRate = closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0.0;

        const totalEl = document.getElementById('journalTotalTrades');
        const winEl = document.getElementById('journalWinRate');
        if (totalEl) totalEl.textContent = totalTrades;
        if (winEl) winEl.textContent = `${winRate.toFixed(1)}%`;

        tableBody.innerHTML = this.journal.map(log => {
            let badgeClass = "text-yellow-500 bg-yellow-500/10";
            if (log.outcome === "WIN") badgeClass = "text-green-500 bg-green-500/10 border border-green-500/20";
            if (log.outcome === "LOSS") badgeClass = "text-red-500 bg-red-500/10 border border-red-500/20";

            return `
                <tr class="border-b border-gray-800/50 hover:bg-[#1e2329]/60 text-xs text-gray-300">
                    <td class="p-3">${log.date}</td>
                    <td class="p-3 font-bold text-white">${log.coin} (${log.timeframe})</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded font-bold ${log.recommendation.includes('Long') ? 'text-green-400 bg-green-950/20' : 'text-red-400 bg-red-950/20'}">${log.recommendation}</span></td>
                    <td class="p-3 font-mono">Entry: ${log.entry} | SL: ${log.stopLoss}</td>
                    <td class="p-3 font-mono">${log.confidence}</td>
                    <td class="p-3">${log.quality}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded font-bold text-[10px] ${badgeClass}">${log.outcome}</span></td>
                    <td class="p-3 text-right space-x-1.5">
                        <button class="text-green-400 hover:text-green-200" onclick="window.nexusApp.markJournalOutcome('${log.id}', 'WIN')">Win</button>
                        <button class="text-red-400 hover:text-red-200" onclick="window.nexusApp.markJournalOutcome('${log.id}', 'LOSS')">Loss</button>
                        <button class="text-gray-500 hover:text-white" onclick="window.nexusApp.deleteJournalItem('${log.id}')">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');

        window.nexusApp = this;
    }

    markJournalOutcome(id, outcome) {
        this.journal = this.journal.map(t => {
            if (t.id === id) t.outcome = outcome;
            return t;
        });
        localStorage.setItem('nexus_trade_journal', JSON.stringify(this.journal));
        this.renderJournalTable();
    }

    deleteJournalItem(id) {
        this.journal = this.journal.filter(t => t.id !== id);
        localStorage.setItem('nexus_trade_journal', JSON.stringify(this.journal));
        this.renderJournalTable();
    }

    /**
     * Custom detailed News articles rendering
     */
    renderNewsArticles() {
        const feedList = document.getElementById('newsFeedList');
        if (!feedList) return;

        const categoryFilter = document.getElementById('newsCategorySelect')?.value || 'all';
        const impactFilter = document.getElementById('newsImpactSelect')?.value || 'all';

        const newsItems = [
            {
                headline: `SEC expected to approve multiple ETF options applications by next Friday.`,
                category: `ETF`,
                impact: `high`,
                impactScore: `+75`,
                confidence: `92%`,
                source: `Reuters Pro`,
                time: `12m ago`,
                sentiment: `Bullish`
            },
            {
                headline: `Binance announces upcoming core node network upgrades for major EVM assets.`,
                category: `upgrade`,
                impact: `med`,
                impactScore: `+22`,
                confidence: `85%`,
                source: `Exchange News`,
                time: `34m ago`,
                sentiment: `Neutral`
            },
            {
                headline: `Major whale wallets deposit $320M in stablecoins onto dYdX, preparing for long trades.`,
                category: `announcement`,
                impact: `high`,
                impactScore: `+64`,
                confidence: `89%`,
                source: `Glassnode Feed`,
                time: `1h ago`,
                sentiment: `Bullish`
            },
            {
                headline: `Global government derivatives regulation taskforce schedules surprise summit next Tuesday.`,
                category: `regulation`,
                impact: `med`,
                impactScore: `-12`,
                confidence: `76%`,
                source: `Bloomberg Policy`,
                time: `2h ago`,
                sentiment: `Bearish`
            },
            {
                headline: `Upcoming token unlock schedule signals over $420M in supply flooding the spot markets.`,
                category: `unlock`,
                impact: `low`,
                impactScore: `-5`,
                confidence: `94%`,
                source: `TokenUnlocks Alert`,
                time: `4h ago`,
                sentiment: `Bearish`
            }
        ];

        let filtered = [...newsItems];
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(item => item.category === categoryFilter);
        }
        if (impactFilter !== 'all') {
            filtered = filtered.filter(item => item.impact === impactFilter);
        }

        if (filtered.length === 0) {
            feedList.innerHTML = `<div class="p-4 text-center text-gray-500 text-xs col-span-2">No news articles match criteria.</div>`;
            return;
        }

        feedList.innerHTML = filtered.map(item => {
            const isBull = item.sentiment === "Bullish";
            const sentColor = isBull ? "text-green-400 bg-green-500/10 border-green-500/20" : (item.sentiment === "Bearish" ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-gray-400 bg-gray-500/10 border-gray-500/20");

            return `
                <div class="bg-[#1e2329] p-3.5 rounded border border-gray-800 flex flex-col justify-between space-y-2">
                    <div>
                        <div class="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                            <span class="font-bold uppercase tracking-wider">${item.category} | ${item.source}</span>
                            <span class="font-mono">${item.time}</span>
                        </div>
                        <p class="text-xs text-white font-semibold leading-relaxed">"${item.headline}"</p>
                    </div>
                    <div class="flex items-center justify-between text-[10px] font-mono border-t border-gray-800/80 pt-2">
                        <span class="px-2 py-0.5 rounded border font-bold ${sentColor}">${item.sentiment}</span>
                        <div class="flex space-x-3 text-gray-400">
                            <span>Impact: <strong class="${item.impactScore.includes('+') ? 'text-green-500' : 'text-red-500'}">${item.impactScore}</strong></span>
                            <span>Confidence: <strong class="text-white">${item.confidence}</strong></span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.nexusApp = new AppController();
});
