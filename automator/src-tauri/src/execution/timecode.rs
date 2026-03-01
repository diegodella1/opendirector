/// Timecode-based trigger monitor.
///
/// Fires actions when clip playback reaches a specific timecode point.
/// Triggers can be absolute (from start) or relative to end (negative values).
/// Each trigger fires exactly once per registration (idempotent via `fired` flag).

/// A single timecode trigger tied to an element.
#[derive(Debug, Clone)]
pub struct TimecodeTrigger {
    /// Element ID to fire when triggered.
    pub element_id: String,
    /// Trigger point in ms. Positive = from start, negative = from end.
    pub trigger_at_ms: i64,
    /// Clip total duration (needed to compute absolute position for negative triggers).
    pub duration_ms: u64,
    /// Whether this trigger has already fired.
    pub fired: bool,
}

/// Monitors ACTS updates and checks registered triggers.
pub struct TimecodeMonitor {
    triggers: Vec<TimecodeTrigger>,
}

impl TimecodeMonitor {
    pub fn new() -> Self {
        Self {
            triggers: Vec::new(),
        }
    }

    /// Register a trigger for an element.
    ///
    /// `trigger_config` is a JSON string like `{"at": "-3000"}` (3s before end)
    /// or `{"at": "5000"}` (5s from start).
    pub fn register(&mut self, element_id: String, trigger_config: &str, clip_duration_ms: u64) {
        let at_ms = match serde_json::from_str::<serde_json::Value>(trigger_config) {
            Ok(val) => {
                if let Some(at_str) = val.get("at").and_then(|v| v.as_str()) {
                    match at_str.parse::<i64>() {
                        Ok(ms) => ms,
                        Err(_) => {
                            log::warn!(
                                "Invalid trigger_config 'at' value for element {}: {}",
                                element_id,
                                at_str
                            );
                            return;
                        }
                    }
                } else if let Some(at_num) = val.get("at").and_then(|v| v.as_i64()) {
                    at_num
                } else {
                    log::warn!(
                        "Missing 'at' field in trigger_config for element {}: {}",
                        element_id,
                        trigger_config
                    );
                    return;
                }
            }
            Err(e) => {
                log::warn!(
                    "Failed to parse trigger_config for element {}: {}",
                    element_id,
                    e
                );
                return;
            }
        };

        log::info!(
            "Registered timecode trigger: element={}, at={}ms, duration={}ms",
            element_id,
            at_ms,
            clip_duration_ms
        );

        self.triggers.push(TimecodeTrigger {
            element_id,
            trigger_at_ms: at_ms,
            duration_ms: clip_duration_ms,
            fired: false,
        });
    }

    /// Clear all registered triggers (e.g., on block change).
    pub fn clear(&mut self) {
        self.triggers.clear();
    }

    /// Check current ACTS position against all unfired triggers.
    ///
    /// Returns element IDs that should fire at this position.
    pub fn check(&mut self, position_ms: u64, duration_ms: u64) -> Vec<String> {
        let mut to_fire = Vec::new();

        for trigger in &mut self.triggers {
            if trigger.fired {
                continue;
            }

            // Compute absolute trigger point
            let trigger_point = if trigger.trigger_at_ms >= 0 {
                trigger.trigger_at_ms as u64
            } else {
                // Negative = from end. Use the duration from ACTS update if available,
                // otherwise fall back to the registered duration.
                let dur = if duration_ms > 0 {
                    duration_ms
                } else {
                    trigger.duration_ms
                };
                dur.saturating_sub(trigger.trigger_at_ms.unsigned_abs())
            };

            if position_ms >= trigger_point {
                trigger.fired = true;
                to_fire.push(trigger.element_id.clone());
                log::info!(
                    "Timecode trigger fired: element={}, position={}ms >= trigger_point={}ms",
                    trigger.element_id,
                    position_ms,
                    trigger_point
                );
            }
        }

        to_fire
    }

    /// Get the number of registered triggers (for diagnostics).
    pub fn trigger_count(&self) -> usize {
        self.triggers.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_fire_positive() {
        let mut monitor = TimecodeMonitor::new();
        monitor.register("el1".to_string(), r#"{"at": "5000"}"#, 60000);
        assert_eq!(monitor.trigger_count(), 1);

        // Before trigger point
        let fired = monitor.check(3000, 60000);
        assert!(fired.is_empty());

        // At trigger point
        let fired = monitor.check(5000, 60000);
        assert_eq!(fired, vec!["el1"]);

        // Won't fire again (idempotent)
        let fired = monitor.check(6000, 60000);
        assert!(fired.is_empty());
    }

    #[test]
    fn test_register_and_fire_negative() {
        let mut monitor = TimecodeMonitor::new();
        // 3 seconds before end of a 60s clip = fire at 57000ms
        monitor.register("el2".to_string(), r#"{"at": "-3000"}"#, 60000);

        let fired = monitor.check(56000, 60000);
        assert!(fired.is_empty());

        let fired = monitor.check(57000, 60000);
        assert_eq!(fired, vec!["el2"]);
    }

    #[test]
    fn test_multiple_triggers() {
        let mut monitor = TimecodeMonitor::new();
        monitor.register("el1".to_string(), r#"{"at": "1000"}"#, 60000);
        monitor.register("el2".to_string(), r#"{"at": "5000"}"#, 60000);
        monitor.register("el3".to_string(), r#"{"at": "-1000"}"#, 60000);

        let fired = monitor.check(1500, 60000);
        assert_eq!(fired, vec!["el1"]);

        let fired = monitor.check(5500, 60000);
        assert_eq!(fired, vec!["el2"]);

        let fired = monitor.check(59500, 60000);
        assert_eq!(fired, vec!["el3"]);
    }

    #[test]
    fn test_clear() {
        let mut monitor = TimecodeMonitor::new();
        monitor.register("el1".to_string(), r#"{"at": "1000"}"#, 60000);
        assert_eq!(monitor.trigger_count(), 1);

        monitor.clear();
        assert_eq!(monitor.trigger_count(), 0);

        // After clear, nothing fires
        let fired = monitor.check(2000, 60000);
        assert!(fired.is_empty());
    }

    #[test]
    fn test_invalid_config_ignored() {
        let mut monitor = TimecodeMonitor::new();
        monitor.register("el1".to_string(), "not json", 60000);
        assert_eq!(monitor.trigger_count(), 0);

        monitor.register("el2".to_string(), r#"{"no_at": "1000"}"#, 60000);
        assert_eq!(monitor.trigger_count(), 0);

        monitor.register("el3".to_string(), r#"{"at": "notanumber"}"#, 60000);
        assert_eq!(monitor.trigger_count(), 0);
    }

    #[test]
    fn test_numeric_at_value() {
        let mut monitor = TimecodeMonitor::new();
        // JSON number instead of string
        monitor.register("el1".to_string(), r#"{"at": 3000}"#, 60000);
        assert_eq!(monitor.trigger_count(), 1);

        let fired = monitor.check(3000, 60000);
        assert_eq!(fired, vec!["el1"]);
    }

    #[test]
    fn test_negative_trigger_saturating() {
        let mut monitor = TimecodeMonitor::new();
        // Trigger at -70000 on a 60000ms clip => saturates to 0
        monitor.register("el1".to_string(), r#"{"at": "-70000"}"#, 60000);

        // Should fire immediately since trigger_point is 0
        let fired = monitor.check(0, 60000);
        assert_eq!(fired, vec!["el1"]);
    }
}
