/**
 * Live Alert Triggers & Browser Notifications
 */

export class AlertsManager {
    constructor() {
        this.alerts = JSON.parse(localStorage.getItem('nexus_trading_alerts') || '[]');
        this.triggeredHistory = [];
        this.soundEnabled = false;

        // Initialize browser notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
    }

    addAlert(symbol, type, targetValue) {
        const newAlert = {
            id: Date.now().toString(),
            symbol: symbol.toUpperCase(),
            type, // e.g. 'rsi_below', 'macd_cross_up', 'price_cross_above', etc.
            targetValue: targetValue ? parseFloat(targetValue) : null,
            active: true,
            createdAt: new Date().toISOString()
        };
        this.alerts.push(newAlert);
        this.saveAlerts();
        return newAlert;
    }

    removeAlert(id) {
        this.alerts = this.alerts.filter(alert => alert.id !== id);
        this.saveAlerts();
    }

    getAlertsForSymbol(symbol) {
        return this.alerts.filter(alert => alert.symbol === symbol.toUpperCase());
    }

    saveAlerts() {
        localStorage.setItem('nexus_trading_alerts', JSON.stringify(this.alerts));
    }

    /**
     * Scan current symbol indicators for triggering alerts
     * @param {string} symbol - Current active symbol
     * @param {number} currentPrice - Current market tick
     * @param {object} techData - Extracted indicator metrics: { rsi, macd, score, confidence, emas }
     */
    checkAlerts(symbol, currentPrice, techData) {
        const activeAlerts = this.alerts.filter(a => a.active && a.symbol === symbol.toUpperCase());
        if (activeAlerts.length === 0) return;

        activeAlerts.forEach(alert => {
            let isTriggered = false;
            let triggerMessage = '';

            switch (alert.type) {
                case 'rsi_below':
                    if (techData.rsi !== null && techData.rsi < 30) {
                        isTriggered = true;
                        triggerMessage = `RSI oversold trigger: RSI is currently ${techData.rsi.toFixed(1)}`;
                    }
                    break;
                case 'rsi_above':
                    if (techData.rsi !== null && techData.rsi > 70) {
                        isTriggered = true;
                        triggerMessage = `RSI overbought trigger: RSI is currently ${techData.rsi.toFixed(1)}`;
                    }
                    break;
                case 'macd_cross_up':
                    if (techData.macdCross === 'up') {
                        isTriggered = true;
                        triggerMessage = `MACD Golden crossover detected (Bullish)`;
                    }
                    break;
                case 'macd_cross_down':
                    if (techData.macdCross === 'down') {
                        isTriggered = true;
                        triggerMessage = `MACD Death crossover detected (Bearish)`;
                    }
                    break;
                case 'ema_cross_up':
                    if (techData.ema9_20Cross === 'up') {
                        isTriggered = true;
                        triggerMessage = `EMA 9 crossed above EMA 20 (Bullish Momentum)`;
                    }
                    break;
                case 'ema_cross_down':
                    if (techData.ema9_20Cross === 'down') {
                        isTriggered = true;
                        triggerMessage = `EMA 9 crossed below EMA 20 (Bearish Momentum)`;
                    }
                    break;
                case 'score_above':
                    if (techData.score >= 80) {
                        isTriggered = true;
                        triggerMessage = `Extreme bullish intelligence score! Score reached ${techData.score}`;
                    }
                    break;
                case 'score_below':
                    if (techData.score <= -80) {
                        isTriggered = true;
                        triggerMessage = `Extreme bearish intelligence score! Score dropped to ${techData.score}`;
                    }
                    break;
                case 'confidence_above':
                    if (techData.confidence >= 90) {
                        isTriggered = true;
                        triggerMessage = `AI analytical alignment of over ${techData.confidence}% confidence!`;
                    }
                    break;
                case 'price_cross_above':
                    if (alert.targetValue && currentPrice >= alert.targetValue) {
                        isTriggered = true;
                        triggerMessage = `Target boundary reached: Price crossed above ${alert.targetValue}`;
                    }
                    break;
                case 'price_cross_below':
                    if (alert.targetValue && currentPrice <= alert.targetValue) {
                        isTriggered = true;
                        triggerMessage = `Target boundary reached: Price crossed below ${alert.targetValue}`;
                    }
                    break;
            }

            if (isTriggered) {
                // Set inactive to avoid spamming
                alert.active = false;
                this.saveAlerts();

                // Trigger alerts
                this.fireAlert(alert, triggerMessage);
            }
        });
    }

    fireAlert(alert, message) {
        const title = `🚨 NEXUS Alert: ${alert.symbol}`;
        
        // 1. Browser Notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body: message });
        }

        // 2. Audio Beep (synthesized with Web Audio API)
        if (this.soundEnabled) {
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                
                // Double chime sound
                const playChime = (delay, freq) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
                    
                    gain.gain.setValueAtTime(0.3, audioCtx.currentTime + delay);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.3);
                    
                    osc.start(audioCtx.currentTime + delay);
                    osc.stop(audioCtx.currentTime + delay + 0.3);
                };

                playChime(0, 880);   // A5
                playChime(0.15, 1318.51); // E6
            } catch (err) {
                console.error('Audio synthesizer failed to trigger chime:', err);
            }
        }

        // 3. Trigger callback list for UI alerts
        if (window.onAlertTriggered) {
            window.onAlertTriggered({
                id: alert.id,
                symbol: alert.symbol,
                message,
                time: new Date().toLocaleTimeString()
            });
        }
    }
}
