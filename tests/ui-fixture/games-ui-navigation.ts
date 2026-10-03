/** Test-only router adapter for the isolated actual-UI fixture. */
export function useRouter(){return {push:(path:string)=>{window.location.href=path;}};}
