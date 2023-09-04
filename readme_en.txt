18th Hokkaido Information University Computer Programming Contest Entries
================================================== ===

Entry work
----------------------------------------

* Title of work: Ultra-slow proxy
* Overview: A proxy server that unnecessarily slows down website display
* Language used: Node.js
* Operating environment: Node.js v18.0 or higher and npm v6.14.0 or higher


Summary of submitted works
----------------------------------------

Write a brief outline of the submitted work.

Applicant
----------------------------------------

### Representative

* 2112097: Yuma Sawai

How it works
----------------------------------------

1. Execute the following command in the environment where Nodejs is installed.

````
npm run start www.example.com
````
* When specifying a different host name, be sure to disable automatic configuration in step 2, then enter the command to enable it again.


2. Set the automatic configuration file for the proxy server.
The specified URL is `http://localhost:3002/abe.pac`


3. Access from a browser.

When accessing `http://www.example.com/`, the proxy server
Displayed via
*In some cases, it may take several minutes to start being displayed, so
Try leaving it for a while.

4. (Optional) Change the speed limit
If you send a GET request to `http://127.0.0.1:3002/delay/1000`,
It takes 1000ms to send one character.


Proposal document, design document, UML, work description video
----------------------------------------

none


Extension library and data used
----------------------------------------
*Name: Wrote an http proxy server with https support in Node.js in his 80 lines
     + Description: Proxy server implementation example written in 80 lines
     + Where to get: https://qiita.com/LightSpeedC/items/5c1edc2c974206c743f4
     + Use: Used as a reference for HTTPS proxy implementation example


* Name: [nodejs] A simple example how to write a proxy server piping server request to client request / client response back to server response.
     + Description: Simple proxy implementation example
     + Where to get: https://gist.github.com/bhongy/2e6f0a9f9932ab6d1c43b013a7ad773a
     + Purpose: Referred to proxy server implementation

Detailed explanation about the work
----------------------------------------

* Concept of the work

The concept is a proxy server that can display websites at a much slower speed than necessary.
Slow proxies already exist, but I thought it would be interesting to create a proxy that can slow down to the limit.
This tool achieves slowness that exceeds the limits of the protocol,
You can visually experience the process of rendering a website, displaying images, and building a DOM tree.
Web browsers use parallel requests and cache to speed up display, but
This tool allows you to better understand the behavior of web browsers by disabling those functions.
It can be used to learn browser behavior and test website display in low-speed lines or high-load environments.


* Novelty

No other tool can slow down a website by more than 16bps.
This is because a TCP connection cannot be established if the line speed is less than 16bps.
This tool runs after the browser establishes a connection with the server.
It differs from conventional tools in that it does not cause timeouts because the speed is limited at a level higher than TCP.
This visible slowness of display cannot be achieved with other tools.


* manufacturing

We have thoroughly worked on slowing down the speed, so we will introduce the main functions.
Modern browsers speed up website display
Make requests in parallel while building the DOM tree.
Therefore, this tool uses Mutex to handle parallel requests.
Processing one by one increases the loading time.
It also rewrites HTTP headers to prevent browsers from caching websites.
In the case of HTTPS communication, the HTTP header cannot be rewritten, so it is necessary to disable the cache on the browser side.

You can change the communication speed by changing some constants.
BYTE_MULTIPLIER allows you to specify the number of bytes to send at once.
DELAY_PER_BYTE allows you to specify the time it takes to send one character.
If you specify the number of bytes of the site in TOTAL_BYTES and the time it takes to display in ESTIMATE_TIME_MSEC,
Appropriate DELAY_PER_BYTE is automatically set.


*Technical elements

to do TCP-level rate limiting, rather than a framework
We used the Node.js standard http module and TCP sockets.
In addition, it was implemented using Node.js, which has loose restrictions on the execution environment.
Since JavaScript basically performs asynchronous communication using callback functions,
Suitable for handling asynchronous network requests.
HTTP communication can be sent literally one character at a time,
In the case of HTTPS communication, it is encrypted by TLS, so until a certain amount of encrypted blocks that can be decrypted arrives at the client
It is not displayed in the browser.
Although it is possible to implement a transparent proxy using certificates,
It was not adopted because the number of setting items increases.


* Program design

If HTTP data is treated as a character string when transferring an image,
Because it is arbitrarily converted to the internal encoding of Nodejs,
It was difficult to handle it as an 8-bit int array.
Compare the original image and the image after proxy in binary
It took me a while to realize that the cause was the internal encoding.

In addition, it takes time to implement the process of separating and sending the data for each character.
Since TCP is a stream type protocol, received data is sent in multiple chunks.
In order to send characters one by one, it is necessary to add chunks to the queue, divide them, and send them in order.
Since JavaScript calls functions triggered by events,
It is incompatible with loop processing where only one character can be sent, one character at a time.
Finally create a buffer by nesting HTTP request callbacks,
It was implemented by reading a buffer from an asynchronous function that sends characters one by one.
For example, in Ajax or dynamic web content, an HTTP response may span multiple packets.
Thanks to this implementation, it is possible to always send one character at a time even if the response consists of multiple packets.


* Source code

Since we could not find an external library that can operate at the TCP level,
This tool is implemented using only the standard library.
As a result, the number of primitive descriptions has increased, and the description has become enormous.
Keep in mind to make frequent comments to improve readability,
I was careful not to nest the callbacks too much.
However, since JavaScript generally tends to be less readable,
I regret that I probably should have created a class using TypeScript.