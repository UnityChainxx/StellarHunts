"use client";

import Providers from "./Providers";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();
export { Providers };
export default Providers;