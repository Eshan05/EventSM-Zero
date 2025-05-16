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

export default function Emojis() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <main className="flex items-center justify-center">
      <Popover onOpenChange={setIsOpen} open={isOpen}>
        <PopoverTrigger asChild>
          <Button size={'md-icon'} variant={'outline'}><BsEmojiSmile className="size-3.5" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-fit p-0">
          <EmojiPicker
            className="h-[342px]"
            onEmojiSelect={({ emoji }) => {
              setIsOpen(false);
              console.log(emoji);
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