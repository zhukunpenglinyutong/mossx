import enPart1 from "./en.part1";
import enPart2 from "./en.part2";
import enPart3 from "./en.part3";

const enPart2Settings = (enPart2 as { settings?: Partial<typeof enPart1.settings> }).settings ?? {};
const enPart3Settings = (enPart3 as { settings?: Partial<typeof enPart1.settings> }).settings ?? {};
const enPart2Composer = (enPart2 as { composer?: Partial<typeof enPart1.composer> }).composer ?? {};
const enPart3Composer = (enPart3 as { composer?: Partial<typeof enPart1.composer> }).composer ?? {};

const en = {
  ...enPart1,
  ...enPart2,
  ...enPart3,
  composer: {
    ...enPart1.composer,
    ...enPart2Composer,
    ...enPart3Composer,
  },
  settings: {
    ...enPart1.settings,
    ...enPart2Settings,
    ...enPart3Settings,
  },
};

export default en;
