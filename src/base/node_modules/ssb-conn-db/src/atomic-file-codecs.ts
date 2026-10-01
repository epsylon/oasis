/**
 * Automatically heal from corruption .json files.
 *
 * - Remove (some) extraneous characters from the end of the file
 * - If nothing works, return empty object instead of crashing
 */
export const selfHealingJSONCodec = {
  encode: function(obj: any) {
    return JSON.stringify(obj, null, 2);
  },
  decode: function(input: any) {
    if (!input) return {};
    const str: string = input.toString();
    const MAX_TRIM = 10;
    let foundCorruption = false;
    for (let i = 0; i < MAX_TRIM; i++) {
      try {
        return JSON.parse(str.substring(0, str.length - i));
      } catch (err) {
        if (!foundCorruption) {
          foundCorruption = true;
          console.warn(
            'WARNING: ssb-conn-db found a corrupted conn.json file ' +
              'and is attempting to heal it',
          );
        }
        continue;
      }
    }
    console.error('ERROR! ssb-conn-db failed to heal corrupted conn.json file');
    return {};
  },
};
