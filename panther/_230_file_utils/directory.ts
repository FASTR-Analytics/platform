// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

//////////////////////////////////////////////////////////////////////////////////////////
//  _______   __                                  __                                    //
// /       \ /  |                                /  |                                   //
// $$$$$$$  |$$/   ______    ______    _______  _$$ |_     ______    ______   __    __  //
// $$ |  $$ |/  | /      \  /      \  /       |/ $$   |   /      \  /      \ /  |  /  | //
// $$ |  $$ |$$ |/$$$$$$  |/$$$$$$  |/$$$$$$$/ $$$$$$/   /$$$$$$  |/$$$$$$  |$$ |  $$ | //
// $$ |  $$ |$$ |$$ |  $$/ $$    $$ |$$ |        $$ | __ $$ |  $$ |$$ |  $$/ $$ |  $$ | //
// $$ |__$$ |$$ |$$ |      $$$$$$$$/ $$ \_____   $$ |/  |$$ \__$$ |$$ |      $$ \__$$ | //
// $$    $$/ $$ |$$ |      $$       |$$       |  $$  $$/ $$    $$/ $$ |      $$    $$ | //
// $$$$$$$/  $$/ $$/        $$$$$$$/  $$$$$$$/    $$$$/   $$$$$$/  $$/        $$$$$$$ | //
//                                                                           /  \__$$ | //
//                                                                           $$    $$/  //
//                                                                            $$$$$$/   //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

// ================================================================================
// DIRECTORY UTILITIES
// ================================================================================

export function getParentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");

  if (lastSlash <= 0) return ".";

  // Handle Windows drive letters
  if (lastSlash === 2 && normalized[1] === ":") {
    return normalized.substring(0, 3);
  }

  return normalized.substring(0, lastSlash);
}

export async function ensureParentDir(filePath: string): Promise<void> {
  const parentDir = getParentDirectory(filePath);
  await Deno.mkdir(parentDir, { recursive: true });
}
