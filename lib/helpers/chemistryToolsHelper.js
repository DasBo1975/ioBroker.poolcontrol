'use strict';

const { I18n } = require('@iobroker/adapter-core');

const PH_STEP = 0.1;
const VOLUME_REFERENCE_L = 10000;

const chemistryToolsHelper = {
    adapter: null,

    /**
     * @param {import('iobroker').Adapter} adapter - ioBroker adapter instance
     */
    init(adapter) {
        this.adapter = adapter;

        void this._subscribeStates();
        void this._prefillCalculatorValues();

        this.adapter.log.debug('[chemistryToolsHelper] Initialized');
    },

    async _subscribeStates() {
        const ids = [
            'general.pool_size',
            'chemistry.ph.input.current_value',

            'chemistry.tools.ph_plus_calculator.05_calculate',
            'chemistry.tools.ph_plus_calculator.01_pool_volume_l',
            'chemistry.tools.ph_plus_calculator.02_current_ph',
            'chemistry.tools.ph_plus_calculator.03_target_ph',
            'chemistry.tools.ph_plus_calculator.04_grams_per_10000l_01ph',

            'chemistry.tools.ph_minus_calculator.05_calculate',
            'chemistry.tools.ph_minus_calculator.01_pool_volume_l',
            'chemistry.tools.ph_minus_calculator.02_current_ph',
            'chemistry.tools.ph_minus_calculator.03_target_ph',
            'chemistry.tools.ph_minus_calculator.04_grams_per_10000l_01ph',

            'chemistry.tools.salt_calculator.04_calculate',
            'chemistry.tools.salt_calculator.01_pool_volume_l',
            'chemistry.tools.salt_calculator.02_current_salt_ppm',
            'chemistry.tools.salt_calculator.03_target_salt_ppm',
        ];

        for (const id of ids) {
            await this.adapter.subscribeStatesAsync(id);
        }

        this.adapter.log.debug('[chemistryToolsHelper] Own states subscribed');
    },

    /**
     * @param {string} id - Changed state ID
     * @param {ioBroker.State | null | undefined} state - Changed state
     * @returns {Promise<void>}
     */
    async handleStateChange(id, state) {
        if (!state) {
            return;
        }

        try {
            if (id.endsWith('general.pool_size') || id.endsWith('chemistry.ph.input.current_value')) {
                await this._prefillCalculatorValues();
                return;
            }

            if (
                id.endsWith('chemistry.tools.ph_plus_calculator.05_calculate') &&
                state.ack === false &&
                state.val === true
            ) {
                await this._calculatePhPlus();
                await this._setBool('chemistry.tools.ph_plus_calculator.05_calculate', false);
                return;
            }

            if (
                id.endsWith('chemistry.tools.ph_minus_calculator.05_calculate') &&
                state.ack === false &&
                state.val === true
            ) {
                await this._calculatePhMinus();
                await this._setBool('chemistry.tools.ph_minus_calculator.05_calculate', false);
            }

            if (
                id.endsWith('chemistry.tools.salt_calculator.04_calculate') &&
                state.ack === false &&
                state.val === true
            ) {
                await this._calculateSalt();
                await this._setBool('chemistry.tools.salt_calculator.04_calculate', false);
            }
        } catch (err) {
            this.adapter.log.warn(`[chemistryToolsHelper] Error in handleStateChange: ${err.message}`);
        }
    },

    async _prefillCalculatorValues() {
        const poolVolume = await this._readNumber('general.pool_size');
        const currentPh = await this._readNumber('chemistry.ph.input.current_value');

        await this._prefillNumberIfEmpty('chemistry.tools.ph_plus_calculator.01_pool_volume_l', poolVolume);
        await this._prefillNumberIfEmpty('chemistry.tools.ph_minus_calculator.01_pool_volume_l', poolVolume);
        await this._prefillNumberIfEmpty('chemistry.tools.salt_calculator.01_pool_volume_l', poolVolume);

        await this._prefillNumberIfEmpty('chemistry.tools.ph_plus_calculator.02_current_ph', currentPh);
        await this._prefillNumberIfEmpty('chemistry.tools.ph_minus_calculator.02_current_ph', currentPh);
    },

    /**
     * Calculates the pH Plus amount using the manufacturer dosage formula.
     *
     * @returns {Promise<void>}
     */
    async _calculatePhPlus() {
        const base = 'chemistry.tools.ph_plus_calculator';

        const poolVolume = await this._readNumber(`${base}.01_pool_volume_l`);
        const currentPh = await this._readNumber(`${base}.02_current_ph`);
        const targetPh = await this._readNumber(`${base}.03_target_ph`);
        const dosageFactor = await this._readNumber(`${base}.04_grams_per_10000l_01ph`);

        const validation = this._validateInputs({
            type: 'plus',
            poolVolume,
            currentPh,
            targetPh,
            dosageFactor,
        });

        if (!validation.valid) {
            await this._writeInvalidResult(base, validation.error);
            return;
        }

        const resultGrams = this._calculateAmountGrams(currentPh, targetPh, poolVolume, dosageFactor);
        const roundedGrams = Math.round(resultGrams);

        const resultText =
            `${I18n.translate('Calculated amount')}: ${roundedGrams} g pH Plus. ` +
            `${I18n.translate('Reference value based on common manufacturer dosage.')} ` +
            `${I18n.translate('Follow the manufacturer instructions and re-measure afterwards.')}`;

        await this._writeValidResult(base, roundedGrams, resultText);
    },

    /**
     * Calculates the pH Minus amount using the manufacturer dosage formula.
     *
     * @returns {Promise<void>}
     */
    async _calculatePhMinus() {
        const base = 'chemistry.tools.ph_minus_calculator';

        const poolVolume = await this._readNumber(`${base}.01_pool_volume_l`);
        const currentPh = await this._readNumber(`${base}.02_current_ph`);
        const targetPh = await this._readNumber(`${base}.03_target_ph`);
        const dosageFactor = await this._readNumber(`${base}.04_grams_per_10000l_01ph`);

        const validation = this._validateInputs({
            type: 'minus',
            poolVolume,
            currentPh,
            targetPh,
            dosageFactor,
        });

        if (!validation.valid) {
            await this._writeInvalidResult(base, validation.error);
            return;
        }

        const resultGrams = this._calculateAmountGrams(currentPh, targetPh, poolVolume, dosageFactor);
        const roundedGrams = Math.round(resultGrams);

        const resultText =
            `${I18n.translate('Calculated amount')}: ${roundedGrams} g pH Minus. ` +
            `${I18n.translate('Reference value based on common manufacturer dosage.')} ` +
            `${I18n.translate('Follow the manufacturer instructions and re-measure afterwards.')}`;

        await this._writeValidResult(base, roundedGrams, resultText);
    },

    /**
     * Calculates the salt amount needed to raise the salt concentration.
     *
     * @returns {Promise<void>} Resolves when the salt calculation result has been written.
     */
    async _calculateSalt() {
        const base = 'chemistry.tools.salt_calculator';

        const poolVolume = await this._readNumber(`${base}.01_pool_volume_l`);
        const currentSalt = await this._readNumber(`${base}.02_current_salt_ppm`);
        const targetSalt = await this._readNumber(`${base}.03_target_salt_ppm`);

        if (!Number.isFinite(poolVolume) || poolVolume <= 0) {
            await this._writeInvalidSaltResult(base, I18n.translate('Pool volume must be greater than 0 liters.'));
            return;
        }

        if (!Number.isFinite(currentSalt) || currentSalt < 0) {
            await this._writeInvalidSaltResult(
                base,
                I18n.translate('Current salt concentration must be 0 ppm or higher.'),
            );
            return;
        }

        if (!Number.isFinite(targetSalt) || targetSalt <= currentSalt) {
            await this._writeInvalidSaltResult(
                base,
                I18n.translate('Target salt concentration must be higher than the current salt concentration.'),
            );
            return;
        }

        const resultKg = ((targetSalt - currentSalt) * poolVolume) / 1000000;
        const roundedKg = Math.round(resultKg * 10) / 10;

        const resultText =
            `${I18n.translate('Calculated amount')}: ${roundedKg} kg ${I18n.translate('salt')}. ` +
            `${I18n.translate('Reference value for raising the salt concentration in pool water.')} ` +
            `${I18n.translate('Follow the salt system manufacturer instructions and add salt gradually.')}`;

        await this._writeValidSaltResult(base, roundedKg, resultText);
    },

    /**
     * @param {object} input - Calculator input values
     * @param {'plus' | 'minus'} input.type - Calculator type
     * @param {number} input.poolVolume - Pool volume in liters
     * @param {number} input.currentPh - Current pH value
     * @param {number} input.targetPh - Target pH value
     * @param {number} input.dosageFactor - Dosage factor in grams per 10,000 l and 0.1 pH
     * @returns {{ valid: boolean, error: string }} Validation result with an optional translated error message.
     */
    _validateInputs(input) {
        if (!Number.isFinite(input.poolVolume) || input.poolVolume <= 0) {
            return { valid: false, error: I18n.translate('Pool volume must be greater than 0 liters.') };
        }

        if (!Number.isFinite(input.currentPh) || input.currentPh <= 0 || input.currentPh > 14) {
            return { valid: false, error: I18n.translate('Current pH value must be between 0 and 14.') };
        }

        if (!Number.isFinite(input.targetPh) || input.targetPh <= 0 || input.targetPh > 14) {
            return { valid: false, error: I18n.translate('Target pH value must be between 0 and 14.') };
        }

        if (!Number.isFinite(input.dosageFactor) || input.dosageFactor <= 0) {
            return { valid: false, error: I18n.translate('Dosage factor must be greater than 0 grams.') };
        }

        if (input.type === 'plus' && input.targetPh <= input.currentPh) {
            return {
                valid: false,
                error: I18n.translate('For pH Plus, the target pH value must be higher than the current pH value.'),
            };
        }

        if (input.type === 'minus' && input.targetPh >= input.currentPh) {
            return {
                valid: false,
                error: I18n.translate('For pH Minus, the target pH value must be lower than the current pH value.'),
            };
        }

        return { valid: true, error: '' };
    },

    /**
     * @param {number} currentPh - Current pH value
     * @param {number} targetPh - Target pH value
     * @param {number} poolVolume - Pool volume in liters
     * @param {number} dosageFactor - Dosage factor in grams per 10,000 l and 0.1 pH
     * @returns {number} Calculated amount in grams.
     */
    _calculateAmountGrams(currentPh, targetPh, poolVolume, dosageFactor) {
        const phDifference = Math.abs(targetPh - currentPh);
        const phSteps = phDifference / PH_STEP;
        const volumeFactor = poolVolume / VOLUME_REFERENCE_L;

        return phSteps * volumeFactor * dosageFactor;
    },

    /**
     * @param {string} base - Base state path of the calculator
     * @param {number} grams - Calculated amount in grams
     * @param {string} resultText - Readable result text
     * @returns {Promise<void>}
     */
    async _writeValidResult(base, grams, resultText) {
        const now = Date.now();

        await this._setNumber(`${base}.10_result_grams`, grams);
        await this._setString(`${base}.11_result_text`, resultText);
        await this._setBool(`${base}.12_valid`, true);
        await this._setString(`${base}.13_last_error`, '');
        await this._setNumber(`${base}.14_last_calculated_at`, now);
    },

    /**
     * @param {string} base - Base state path of the calculator
     * @param {string} errorText - Validation error text
     * @returns {Promise<void>}
     */
    async _writeInvalidResult(base, errorText) {
        const now = Date.now();

        await this._setNumber(`${base}.10_result_grams`, 0);
        await this._setString(`${base}.11_result_text`, errorText);
        await this._setBool(`${base}.12_valid`, false);
        await this._setString(`${base}.13_last_error`, errorText);
        await this._setNumber(`${base}.14_last_calculated_at`, now);
    },

    /**
     * @param {string} base - Base state path of the salt calculator
     * @param {number} kg - Calculated salt amount in kilograms
     * @param {string} resultText - Readable result text
     * @returns {Promise<void>} Resolves when the valid salt result states have been updated.
     */
    async _writeValidSaltResult(base, kg, resultText) {
        const now = Date.now();

        await this._setNumber(`${base}.10_result_kg`, kg);
        await this._setString(`${base}.11_result_text`, resultText);
        await this._setBool(`${base}.12_valid`, true);
        await this._setString(`${base}.13_last_error`, '');
        await this._setNumber(`${base}.14_last_calculated_at`, now);
    },

    /**
     * @param {string} base - Base state path of the salt calculator
     * @param {string} errorText - Validation error text
     * @returns {Promise<void>} Resolves when the invalid salt result states have been updated.
     */
    async _writeInvalidSaltResult(base, errorText) {
        const now = Date.now();

        await this._setNumber(`${base}.10_result_kg`, 0);
        await this._setString(`${base}.11_result_text`, errorText);
        await this._setBool(`${base}.12_valid`, false);
        await this._setString(`${base}.13_last_error`, errorText);
        await this._setNumber(`${base}.14_last_calculated_at`, now);
    },

    /**
     * @param {string} id - Target state ID
     * @param {number} newValue - Value to write if target is empty
     * @returns {Promise<void>}
     */
    async _prefillNumberIfEmpty(id, newValue) {
        if (!Number.isFinite(newValue) || newValue <= 0) {
            return;
        }

        const currentValue = await this._readNumber(id);

        if (currentValue > 0) {
            return;
        }

        await this._setNumber(id, newValue);
    },

    /**
     * @param {string} id - State ID
     * @returns {Promise<number>} Numeric state value, or 0 if the state is missing or invalid.
     */
    async _readNumber(id) {
        const state = await this.adapter.getStateAsync(id);
        const value = Number(state?.val);
        return Number.isFinite(value) ? value : 0;
    },

    /**
     * @param {string} id - State ID
     * @param {string} value - Value to write
     * @returns {Promise<void>}
     */
    async _setString(id, value) {
        await this.adapter.setStateChangedAsync(id, { val: String(value ?? ''), ack: true });
    },

    /**
     * @param {string} id - State ID
     * @param {number} value - Value to write
     * @returns {Promise<void>}
     */
    async _setNumber(id, value) {
        const numberValue = Number(value);
        await this.adapter.setStateChangedAsync(id, { val: Number.isFinite(numberValue) ? numberValue : 0, ack: true });
    },

    /**
     * @param {string} id - State ID
     * @param {boolean} value - Value to write
     * @returns {Promise<void>}
     */
    async _setBool(id, value) {
        await this.adapter.setStateChangedAsync(id, { val: !!value, ack: true });
    },

    cleanup() {
        this.adapter = null;
    },
};

module.exports = chemistryToolsHelper;
