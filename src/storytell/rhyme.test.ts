import { describe, it, expect } from "vitest";
import { lastWord, rhymeFamily, syllableCount, lineSyllables } from "./rhyme";

describe("lastWord", () => {
  it("returns the final word lowercased with punctuation stripped", () => {
    expect(lastWord("The door was open.")).toBe("open");
    expect(lastWord("and every single one of them by you.")).toBe("you");
    expect(lastWord("It found you, and it had its lamp about.")).toBe("about");
  });

  it("handles trailing quotes, commas, dashes", () => {
    expect(lastWord('a road that whispered "go,"')).toBe("go");
    expect(lastWord("measured, mapped, and true —")).toBe("true");
  });
});

describe("rhymeFamily", () => {
  it("groups regular rimes that share a spelling", () => {
    expect(rhymeFamily("door")).toBe(rhymeFamily("floor"));
    expect(rhymeFamily("door")).not.toBe("");
  });

  it("groups sight-rhyme pairs via the exceptions map", () => {
    expect(rhymeFamily("true")).toBe(rhymeFamily("you"));
    expect(rhymeFamily("said")).toBe(rhymeFamily("unread"));
    expect(rhymeFamily("snow")).toBe(rhymeFamily("go"));
    expect(rhymeFamily("good")).toBe(rhymeFamily("should"));
    expect(rhymeFamily("about")).toBe(rhymeFamily("out"));
  });

  it("none of those families are the empty (unknown) family", () => {
    for (const w of ["true", "you", "said", "unread", "snow", "go", "good", "should", "about", "out"]) {
      expect(rhymeFamily(w)).not.toBe("");
    }
  });

  it("returns a consistent value for an odd word like orange", () => {
    expect(rhymeFamily("orange")).toBe(rhymeFamily("orange"));
    expect(typeof rhymeFamily("orange")).toBe("string");
  });

  it("returns the empty family for a word with no vowels", () => {
    expect(rhymeFamily("brrr")).toBe("");
  });
});

describe("syllableCount", () => {
  it("counts pinned words correctly", () => {
    expect(syllableCount("run")).toBe(1);
    expect(syllableCount("kilometers")).toBe(5);
    expect(syllableCount("quiet")).toBe(2);
    expect(syllableCount("pavement")).toBe(2);
    expect(syllableCount("rehearsing")).toBe(3);
    expect(syllableCount("measured")).toBe(2);
  });

  it("handles silent-e and short words", () => {
    expect(syllableCount("came")).toBe(1);
    expect(syllableCount("the")).toBe(1);
    expect(syllableCount("moon")).toBe(1);
    expect(syllableCount("out")).toBe(1);
  });

  it("handles consonant + -le endings", () => {
    expect(syllableCount("little")).toBe(2);
    expect(syllableCount("table")).toBe(2);
  });
});

describe("lineSyllables", () => {
  it("sums syllables across words", () => {
    expect(lineSyllables("The moon came out")).toBe(4);
  });

  it("ignores punctuation between words", () => {
    // measured(2) + mapped(1) + and(1) + true(1) = 5
    expect(lineSyllables("measured, mapped, and true")).toBe(5);
  });
});
