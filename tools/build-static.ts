import { accessSync, constants } from "node:fs";

accessSync("404.html", constants.F_OK);
