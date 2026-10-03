/** vitest + jest-dom 装配（Task 8：web 测试环境）。
 *  globals:false 下 RTL 自动 cleanup 不生效，显式注册 afterEach(cleanup)。 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
