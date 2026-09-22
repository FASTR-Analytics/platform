import { type HmisIndicatorType } from "lib";
import { Badge, type Intent } from "panther";
import { indicatorTypeWord } from "./indicator_display";

// The DHIS2 picker's colours for the two types it badges, and the two
// remaining intents for the rest.
function indicatorTypeIntent(type: HmisIndicatorType): Intent {
  switch (type) {
    case "uploaded":
      return "neutral";
    case "dhis2_element":
      return "success";
    case "sum":
      return "warning";
    case "calculated":
      return "primary";
  }
}

export function IndicatorTypeBadge(p: { type: HmisIndicatorType }) {
  return (
    <Badge intent={indicatorTypeIntent(p.type)}>
      {indicatorTypeWord(p.type)}
    </Badge>
  );
}
