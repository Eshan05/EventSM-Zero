import { INSERT_EMBED_COMMAND } from "@lexical/react/LexicalAutoEmbedPlugin"

import { ComponentPickerOption } from "@/components/editor/plugins/picker/component-picker-option"

type EmbedType = "tweet" | "youtube-video"

const EMBED_CONFIGS: Record<EmbedType, { contentName: string; keywords: string[] }> = {
  tweet: { contentName: "Tweet", keywords: ["tweet", "twitter", "x"] },
  "youtube-video": {
    contentName: "YouTube Video",
    keywords: ["youtube", "video"],
  },
}

export function EmbedsPickerPlugin({
  embed,
}: {
  embed: EmbedType
}) {
  const embedConfig = EMBED_CONFIGS[embed]

  return new ComponentPickerOption(`Embed ${embedConfig.contentName}`, {
    keywords: [...embedConfig.keywords, "embed"],
    onSelect: (_queryString, editor) =>
      editor.dispatchCommand(INSERT_EMBED_COMMAND, embed),
  })
}
