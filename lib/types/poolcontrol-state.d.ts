declare global {
    namespace ioBroker {
        interface StateCommon {
            /** Whether PoolControl marks this state value for persistence. */
            persist?: boolean;
        }
    }
}

/**
 * Shared shape for PoolControl state entries created from definition lists.
 */
export interface PoolControlStateDefinition {
    /** Relative state id appended to the definition group's base path. */
    id: string;

    /** Display name shown for the generated state. */
    name: ioBroker.StringOrTranslated;

    /** Human-readable description of the generated state. */
    desc: ioBroker.StringOrTranslated;

    /** ioBroker value type assigned to the generated state. */
    type: ioBroker.CommonType;

    /** Semantic ioBroker role assigned to the generated state. */
    role: string;

    /** Optional unit displayed alongside the state value. */
    unit?: string;

    /** Optional default value used when the state is created. */
    def?: ioBroker.StateValue;

    /** Optional override for whether the generated state is writable. */
    write?: boolean;

    /** Optional mapping of stored values to their display labels. */
    states?: ioBroker.StateCommon['states'];
}

/** Technical weekday id paired with its PoolControl display labels. */
export type TimeControlDayDefinition = [string, { en: string; de: string }];

export {};
