import zhPart1 from "./zh.part1";
import zhPart2 from "./zh.part2";
import zhPart3 from "./zh.part3";

const zhPart2Settings = (zhPart2 as { settings?: Partial<typeof zhPart1.settings> }).settings ?? {};
const zhPart3Settings = (zhPart3 as { settings?: Partial<typeof zhPart1.settings> }).settings ?? {};
const zhPart2Composer = (zhPart2 as { composer?: Partial<typeof zhPart1.composer> }).composer ?? {};
const zhPart3Composer = (zhPart3 as { composer?: Partial<typeof zhPart1.composer> }).composer ?? {};

const zh = {
  ...zhPart1,
  ...zhPart2,
  ...zhPart3,
  composer: {
    ...zhPart1.composer,
    ...zhPart2Composer,
    ...zhPart3Composer,
  },
  settings: {
    ...zhPart1.settings,
    ...zhPart2Settings,
    ...zhPart3Settings,
  },
};

export default zh;
