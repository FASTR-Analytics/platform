// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function getUnique<T extends number | string>(arr: T[]): T[] {
  return arr.filter((v, i, a) => a.indexOf(v) === i);
}

export function getUniqueFaster<T extends number | string>(arr: T[]): T[] {
  return [...new Set<T>(arr)];
}

export function getUniqueFasterByFunc<T>(
  arr: T[],
  byFunc: (v: T) => string,
): T[] {
  const s = new Set<string>();
  const uniqueArr: T[] = [];
  for (const v of arr) {
    const f = byFunc(v);
    if (s.has(f)) {
      continue;
    }
    s.add(f);
    uniqueArr.push(v);
  }
  return uniqueArr;
}

export function getDuplicates<T extends number | string>(arr: T[]): T[] {
  return arr
    .filter((v, i, a) => a.indexOf(v) !== i)
    .filter((v, i, a) => a.indexOf(v) === i);
}

export function isUnique(arr: (number | string)[]): boolean {
  return !arr.some((v, i, a) => a.indexOf(v) !== i);
}

///////////////////////////////////////////////////////////////////////
//  _______                    ______                                //
// /       \                  /      \                               //
// $$$$$$$  | __    __       /$$$$$$  |__    __  _______    _______  //
// $$ |__$$ |/  |  /  |      $$ |_ $$//  |  /  |/       \  /       | //
// $$    $$< $$ |  $$ |      $$   |   $$ |  $$ |$$$$$$$  |/$$$$$$$/  //
// $$$$$$$  |$$ |  $$ |      $$$$/    $$ |  $$ |$$ |  $$ |$$ |       //
// $$ |__$$ |$$ \__$$ |      $$ |     $$ \__$$ |$$ |  $$ |$$ \_____  //
// $$    $$/ $$    $$ |      $$ |     $$    $$/ $$ |  $$ |$$       | //
// $$$$$$$/   $$$$$$$ |      $$/       $$$$$$/  $$/   $$/  $$$$$$$/  //
//           /  \__$$ |                                              //
//           $$    $$/                                               //
//            $$$$$$/                                                //
//                                                                   //
///////////////////////////////////////////////////////////////////////

export function getUniqueByFunc<T>(
  arr: T[],
  byFunc: (v: T) => string | number,
): T[] {
  return arr.filter(
    (v1, i, a) => a.findIndex((v2) => byFunc(v2) === byFunc(v1)) === i,
  );
}

export function isUniqueByFunc<T>(
  arr: T[],
  byFunc: (v: T) => string | number,
): boolean {
  return !arr.some(
    (v1, i, a) => a.findIndex((v2) => byFunc(v2) === byFunc(v1)) !== i,
  );
}
