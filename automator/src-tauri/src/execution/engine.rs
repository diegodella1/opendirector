use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::vmix::pool::VmixPool;

/// An action from the rundown.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Action {
    pub id: String,
    pub phase: String,                          // "on_cue" or "step"
    pub vmix_function: Option<String>,          // e.g., "CutDirect", "Play"
    pub vmix_input: Option<String>,             // Input key (may contain {{variables}})
    pub vmix_params: Option<serde_json::Value>, // Additional params
    pub delay_ms: Option<u64>,
    pub step_label: Option<String>,
    pub step_hotkey: Option<String>,
    pub step_color: Option<String>,
}

/// Show configuration for variable resolution.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ShowConfig {
    pub clip_pool_a_key: Option<String>,
    pub clip_pool_b_key: Option<String>,
    pub gfx_pool_key: Option<String>,
    pub dsk_key: Option<String>,
    pub stinger_index: Option<i32>,
}

/// Result of executing a single action.
#[derive(Debug, Clone, Serialize)]
pub struct ActionResult {
    pub action_id: String,
    pub ok: bool,
    pub vmix_function: String,
    pub message: String,
    pub latency_ms: u64,
}

/// Resolve template variables in an input string.
/// Replaces {{clip_pool}}, {{clip_pool_a}}, {{clip_pool_b}}, {{gfx_pool}}, {{dsk}}, etc.
pub fn resolve_variables(input: &str, config: &ShowConfig) -> String {
    let mut result = input.to_string();

    // Map of variable names to config values
    let vars: HashMap<&str, Option<&String>> = HashMap::from([
        ("clip_pool", config.clip_pool_a_key.as_ref()),
        ("clip_pool_a", config.clip_pool_a_key.as_ref()),
        ("clip_pool_b", config.clip_pool_b_key.as_ref()),
        ("gfx_pool", config.gfx_pool_key.as_ref()),
        ("graphic", config.gfx_pool_key.as_ref()),
        ("dsk", config.dsk_key.as_ref()),
    ]);

    for (var_name, value) in &vars {
        let placeholder = format!("{{{{{}}}}}", var_name);
        if let Some(val) = value {
            result = result.replace(&placeholder, val);
        }
    }

    // Stinger index
    if let Some(idx) = config.stinger_index {
        result = result.replace("{{stinger_index}}", &idx.to_string());
    }

    result
}

/// Execute a list of actions against vMix (sequentially, with delays).
pub async fn execute_actions(
    actions: &[Action],
    config: &ShowConfig,
    vmix: &Arc<VmixPool>,
) -> Vec<ActionResult> {
    let mut results = Vec::new();

    for action in actions {
        // Apply delay if specified
        if let Some(delay) = action.delay_ms {
            if delay > 0 {
                tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
            }
        }

        let vmix_function = action.vmix_function.clone().unwrap_or_default();
        if vmix_function.is_empty() {
            results.push(ActionResult {
                action_id: action.id.clone(),
                ok: true,
                vmix_function: String::new(),
                message: "No vMix function specified (note/delay only)".to_string(),
                latency_ms: 0,
            });
            continue;
        }

        // Build params string: Input=<resolved_key>&<extra_params>
        let mut params_parts: Vec<String> = Vec::new();

        if let Some(ref input_key) = action.vmix_input {
            let resolved = resolve_variables(input_key, config);
            params_parts.push(format!("Input={}", resolved));
        }

        // Merge additional params from vmix_params JSON
        if let Some(ref extra) = action.vmix_params {
            if let Some(obj) = extra.as_object() {
                for (k, v) in obj {
                    let val_str = match v {
                        serde_json::Value::String(s) => resolve_variables(s, config),
                        other => other.to_string(),
                    };
                    params_parts.push(format!("{}={}", k, val_str));
                }
            }
        }

        let params_str = params_parts.join("&");

        // Send to vMix (auto-classifies to the right channel)
        match vmix.send_command(&vmix_function, &params_str).await {
            Ok(vmix_result) => {
                results.push(ActionResult {
                    action_id: action.id.clone(),
                    ok: vmix_result.ok,
                    vmix_function: vmix_result.function,
                    message: vmix_result.message,
                    latency_ms: vmix_result.latency_ms,
                });
            }
            Err(e) => {
                results.push(ActionResult {
                    action_id: action.id.clone(),
                    ok: false,
                    vmix_function,
                    message: e,
                    latency_ms: 0,
                });
            }
        }
    }

    results
}

/// Execute CUE: run all on_cue actions for an element.
pub async fn execute_cue(
    actions: &[Action],
    config: &ShowConfig,
    vmix: &Arc<VmixPool>,
) -> Vec<ActionResult> {
    let cue_actions: Vec<Action> = actions
        .iter()
        .filter(|a| a.phase == "on_cue")
        .cloned()
        .collect();

    execute_actions(&cue_actions, config, vmix).await
}

/// Execute STEP: run actions matching a specific step_label.
pub async fn execute_step(
    actions: &[Action],
    step_label: &str,
    config: &ShowConfig,
    vmix: &Arc<VmixPool>,
) -> Vec<ActionResult> {
    let step_actions: Vec<Action> = actions
        .iter()
        .filter(|a| a.phase == "step" && a.step_label.as_deref() == Some(step_label))
        .cloned()
        .collect();

    execute_actions(&step_actions, config, vmix).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_variables() {
        let config = ShowConfig {
            clip_pool_a_key: Some("CLIP_A".to_string()),
            clip_pool_b_key: Some("CLIP_B".to_string()),
            gfx_pool_key: Some("GFX_1".to_string()),
            dsk_key: Some("DSK_1".to_string()),
            stinger_index: Some(2),
        };

        assert_eq!(resolve_variables("{{clip_pool}}", &config), "CLIP_A");
        assert_eq!(resolve_variables("{{clip_pool_b}}", &config), "CLIP_B");
        assert_eq!(resolve_variables("{{gfx_pool}}", &config), "GFX_1");
        assert_eq!(resolve_variables("Input={{dsk}}", &config), "Input=DSK_1");
        assert_eq!(resolve_variables("{{stinger_index}}", &config), "2");
        assert_eq!(resolve_variables("no_vars_here", &config), "no_vars_here");
    }
}
