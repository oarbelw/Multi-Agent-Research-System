import Context from "../db/models/Context.js";
import { Types } from "mongoose";

export async function getEffectiveContext(contextId: string) {
  const _id = new Types.ObjectId(contextId);
  const [row] = await Context.aggregate([
    { $match: { _id } },
    { $graphLookup: {
        from: "contexts", startWith: "$parentId",
        connectFromField: "parentId", connectToField: "_id",
        as: "ancestors", depthField: "depth"
    }},
    { $addFields: {
        lineage: {
          $concatArrays: [
            [{ level: "$level", _id: "$_id", properties: "$properties", traits: "$traits", modelConfig: "$modelConfig", name: "$name" }],
            { $reverseArray: "$ancestors" }
          ]
        }
    }},
    { $project: { lineage: 1 } }
  ]);

  if (!row) throw new Error("Context not found");

  const origins: Record<string,{value:any;originId:string;originLevel:string}> = {};
  const assign = (obj:any, originId:string, originLevel:string, prefix="") => {
    Object.entries(obj||{}).forEach(([k,v])=>{
      const key = prefix ? `${prefix}.${k}` : k;
      if (!(key in origins)) origins[key] = { value: v, originId, originLevel };
    });
  };

  for (const ctx of row.lineage.reverse()) {
    assign(ctx.properties, String(ctx._id), ctx.level);
    assign(ctx.traits, String(ctx._id), ctx.level, "traits");
    if (ctx.modelConfig) assign(ctx.modelConfig, String(ctx._id), ctx.level, "modelConfig");
  }

  const effective:any = {};
  for (const [path, {value}] of Object.entries(origins)) {
    const parts = path.split(".");
    let cur = effective;
    parts.forEach((p,i)=>{
      if (i === parts.length - 1) cur[p] = value;
      else cur = (cur[p] ??= {});
    });
  }
  return { effective, origins };
}
