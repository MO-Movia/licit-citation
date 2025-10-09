
# Citation ProseMirror Plugin For Licit

## Build

### Commands

- npm ci

- npm pack

#### To use this in Licit

Install the Citation plugin in Licit

- npm install _mo-licit-citation-0.0.1-0.tgz_

Include plugin in licit component

- import CitationPlugin

- add CitationPlugin instance in licit's plugin array

```

import  CitationPlugin  from  '@mo/licit-citation';

const  plugins = [new  CitationPlugin()]

ReactDOM.render(<Licit docID={0} plugins={plugins}/>


```
