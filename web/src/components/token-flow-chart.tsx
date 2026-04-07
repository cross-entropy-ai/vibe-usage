import { useMemo } from "react";
import { Sankey, Tooltip, Layer, Rectangle } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toolHslColor, toolLabel } from "@/lib/tools";
import { fmtNum, shortenModel } from "@/lib/formatters";
import type { CostModelEntry } from "@/types";

const MODEL_COLOR = "hsl(215 20% 65%)";

interface SankeyNode {
  name: string;
  displayName: string;
  color: string;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

// Custom node renderer to show labels
function SankeyNode(props: {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: SankeyNode;
}) {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;

  const isLeft = x < 200;

  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.color}
        fillOpacity={0.9}
      />
      <text
        x={isLeft ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isLeft ? "end" : "start"}
        dominantBaseline="central"
        className="fill-foreground"
        fontSize={12}
      >
        {payload.displayName}
      </text>
    </Layer>
  );
}

export function TokenFlowChart({ data, modelLimit = 12 }: { data: CostModelEntry[]; modelLimit?: number }) {
  const sankeyData = useMemo(() => {
    // Aggregate: tool → model → total tokens
    const flows = new Map<string, Map<string, number>>();
    for (const entry of data) {
      const total = entry.input_tokens + entry.output_tokens + entry.thinking_tokens;
      if (total === 0) continue;

      const tool = entry.tool;
      const model = shortenModel(entry.model).slice(0, 30);
      if (!flows.has(tool)) flows.set(tool, new Map());
      const toolMap = flows.get(tool)!;
      toolMap.set(model, (toolMap.get(model) ?? 0) + total);
    }

    // Build nodes: tools first, then models
    const tools = Array.from(flows.keys()).sort();
    const modelSet = new Set<string>();
    for (const toolMap of flows.values()) {
      for (const model of toolMap.keys()) modelSet.add(model);
    }
    // Sort models by total tokens descending, keep top 12
    const modelTotals = Array.from(modelSet).map((model) => {
      let total = 0;
      for (const toolMap of flows.values()) total += toolMap.get(model) ?? 0;
      return { model, total };
    });
    modelTotals.sort((a, b) => b.total - a.total);
    const topModels = modelTotals.slice(0, modelLimit).map((m) => m.model);

    const nodes: SankeyNode[] = [
      ...tools.map((t) => ({
        name: t,
        displayName: toolLabel(t),
        color: toolHslColor(t),
      })),
      ...topModels.map((m) => ({
        name: m,
        displayName: m,
        color: MODEL_COLOR,
      })),
    ];

    const nodeIndex = new Map(nodes.map((n, i) => [n.name, i]));

    const links: SankeyLink[] = [];
    for (const [tool, toolMap] of flows) {
      // Aggregate "other" models
      let otherTotal = 0;
      for (const [model, value] of toolMap) {
        const idx = nodeIndex.get(model);
        if (idx !== undefined) {
          links.push({
            source: nodeIndex.get(tool)!,
            target: idx,
            value,
          });
        } else {
          otherTotal += value;
        }
      }
      // Add "Other" node if needed
      if (otherTotal > 0) {
        let otherIdx = nodeIndex.get("(other)");
        if (otherIdx === undefined) {
          otherIdx = nodes.length;
          nodes.push({ name: "(other)", displayName: "(other)", color: "hsl(215 15% 75%)" });
          nodeIndex.set("(other)", otherIdx);
        }
        links.push({
          source: nodeIndex.get(tool)!,
          target: otherIdx,
          value: otherTotal,
        });
      }
    }

    return { nodes, links };
  }, [data]);

  if (sankeyData.links.length === 0) return null;

  const totalTokens = sankeyData.links.reduce((s, l) => s + l.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Token Flow</CardTitle>
        <CardDescription>
          Tool → Model token distribution &middot; {fmtNum(totalTokens)} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <Sankey
            width={700}
            height={Math.max(300, sankeyData.nodes.length * 25)}
            data={sankeyData}
            nodeWidth={10}
            nodePadding={14}
            linkCurvature={0.5}
            margin={{ top: 10, right: 120, bottom: 10, left: 80 }}
            node={<SankeyNode x={0} y={0} width={0} height={0} index={0} payload={{ name: "", displayName: "", color: "" }} />}
          >
            <Tooltip
              formatter={(value) => fmtNum(Number(value))}
            />
          </Sankey>
        </div>
      </CardContent>
    </Card>
  );
}
