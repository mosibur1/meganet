const config = {
  ref_code: "BL7YP6",
  delay_start_bot: [1, 2],
  auto_task: false, //true - yes, false - no
  skip_tasks: [
    "oneRef",
    "fiveRef",
    "tenRef",
    "twentyRef",
    "fiftyRef",
    "oneHundredRef",
    "twoHundredRef",
    "threeHundredRef",
    "fiveHundredRef",
    "oneThousandRef",
    "oneNode",
    "fiveNode",
    "tenNode",
    "fiftyNode",
    "oneHundredNode",
    "twoHoursUptime",
    "fourHoursUptime",
    "eightHoursUptime",
    "twelveHoursUptime",
  ],
};
module.exports = { config };
