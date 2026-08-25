export function scenarioMotionMode(scenario) {
  if (scenario === "idle-teardown") return "idle";
  if (scenario.includes("scroll") || scenario === "mixed") return "scroll";
  return "moving-lens";
}

export function shouldNotifyManualGeometry(scenario) {
  return scenarioMotionMode(scenario) === "moving-lens";
}
