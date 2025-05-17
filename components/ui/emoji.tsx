"use client";

import * as React from "react";
import { BsEmojiSmile } from "react-icons/bs";
import { Button } from "@/components/ui/button";
import {
  EmojiPicker,
  EmojiPickerSearch,
  EmojiPickerContent,
  EmojiPickerFooter,
} from "@/components/ui/emoji-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EmojisProps {
  onEmojiSelectAction: (emojiData: { emoji: string; label: string; }) => void;
}

export default function Emojis({ onEmojiSelectAction }: EmojisProps) { // 2. Receive the prop
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <main className="flex items-center justify-center">
      <Popover onOpenChange={setIsOpen} open={isOpen}>
        <PopoverTrigger asChild>
          <Button size={'md-icon'} variant={'outline'}><BsEmojiSmile className="size-4" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-fit p-0">
          <EmojiPicker
            className="h-[342px]"
            onEmojiSelect={(emojiData) => {
              setIsOpen(false);
              onEmojiSelectAction(emojiData); // Pass the whole emojiData object or specific parts
              // For ChatPage, it expects { emoji: string; label: string; }
              // If emojiData is { emoji: '👍', name: 'Thumbs Up', ... }, this works.
              // If EmojiPicker gives you just the string, then onEmojiSelect({ emoji: emojiData, label: '' })
            }}
          >
            <EmojiPickerSearch />
            <EmojiPickerContent />
            <EmojiPickerFooter />
          </EmojiPicker>
        </PopoverContent>
      </Popover>
    </main>
  );
}