'use strict';

/**
 * infoHelper.js
 * ----------------------------------------------------------
 * Verwaltet die Info-States:
 *  - info.developer_greeting
 *  - info.adapter_version
 * ----------------------------------------------------------
 */

const infoHelper = {
    adapter: null,
    dailyTimer: null,

    /**
     * Initialisierung des Info-Helpers
     *
     * @param {import('iobroker').Adapter} adapter - Die ioBroker-Adapterinstanz
     */
    init(adapter) {
        this.adapter = adapter;
        this.adapter.log.debug('[infoHelper] Initialisiert');

        // Adapterversion setzen
        this._updateAdapterVersion();

        // Entwicklergruß setzen
        this._updateDeveloperGreeting();

        // NEU: täglichen Timer starten
        this._startDailyTimer();
    },

    /**
     * Liest die Version aus io-package.json und schreibt sie in info.adapter_version
     */
    _updateAdapterVersion() {
        try {
            const ioPkg = require('../../io-package.json');
            const version = ioPkg.common.version || '';

            this.adapter.setState('info.adapter_version', version, true);
        } catch (err) {
            this.adapter.log.error(`[infoHelper] Fehler beim Lesen der Adapterversion: ${err}`);
        }
    },

    /**
     * Setzt saisonale Grüße in info.developer_greeting
     */
    _updateDeveloperGreeting() {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        let greeting = '';

        // Weihnachten: 20.12. – 27.12.
        if (month === 12 && day >= 20 && day <= 27) {
            greeting = '🎄 PoolControl wünscht frohe Weihnachten! 🎄';
        }

        // Jahreswechsel
        // 31.12.: Guten Rutsch
        if (month === 12 && day === 31) {
            greeting = '🎆 PoolControl wünscht einen guten Rutsch ins neue Jahr! 🎆';
        }

        // 01.01.: Frohes neues Jahr
        if (month === 1 && day === 1) {
            greeting = '🎆 Frohes neues Jahr wünscht PoolControl! 🎆';
        }

        // Dynamische Berechnung von Ostersonntag (Computus)
        const easter = this._computeEaster(now.getFullYear());
        const easterMonth = easter.getMonth() + 1;
        const easterDay = easter.getDate();

        const easterMonday = new Date(easter);
        easterMonday.setDate(easterDay + 1);

        // Ostersonntag
        if (month === easterMonth && day === easterDay) {
            greeting = '🐣 Frohe Ostern wünscht PoolControl! 🐣';
        }

        // Ostermontag
        if (month === easterMonday.getMonth() + 1 && day === easterMonday.getDate()) {
            greeting = '🐣 PoolControl wünscht einen schönen Ostermontag! 🐣';
        }

        this.adapter.setState('info.developer_greeting', greeting, true);
    },

    /**
     * Berechnet das Datum des Ostersonntags für ein bestimmtes Jahr.
     * Algorithmus: Anonymous Gregorian Computus
     *
     * @param {number} year - Das Jahr, für das Ostern berechnet werden soll
     * @returns {Date} Datum des Ostersonntags
     */
    _computeEaster(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    },

    /**
     * Startet den täglichen Update-Intervall (Update 00:01 Uhr)
     */
    _startDailyTimer() {
        // nächsten Trigger für morgen 00:01 berechnen
        const now = new Date();
        const next = new Date(now);

        next.setDate(now.getDate() + 1);
        next.setHours(0, 1, 0, 0);

        const delay = next.getTime() - now.getTime();

        // einmaliger Timer bis 00:01
        this.dailyTimer = setTimeout(() => {
            this._updateDeveloperGreeting();

            // danach täglich um 24h
            this.dailyTimer = setInterval(
                () => {
                    this._updateDeveloperGreeting();
                },
                24 * 60 * 60 * 1000,
            );
        }, delay);
    },

    /**
     * Stoppt Timer (wichtig beim Adapter-Unload)
     */
    cleanup() {
        if (this.dailyTimer) {
            clearTimeout(this.dailyTimer);
            clearInterval(this.dailyTimer);
            this.dailyTimer = null;
        }
    },
};

module.exports = infoHelper;
