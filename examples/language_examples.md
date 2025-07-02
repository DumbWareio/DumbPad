```1c
Сообщить("Hello from 1c");
```

```abnf
hello-world = "Hello from abnf"
```

```accesslog
127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] "GET /hello-from-accesslog HTTP/1.0" 200 2
```

```actionscript
trace("Hello from actionscript");
```

```ada
with Ada.Text_IO;
procedure Hello is
begin
   Ada.Text_IO.Put_Line("Hello from ada");
end Hello;
```

```angelscript
void main() {
  print("Hello from angelscript\n");
}
```

```apache
<VirtualHost *:80>
  ServerName hellofromapache.example.com
  DocumentRoot /var/www/hellofromapache
</VirtualHost>
```

```applescript
display dialog "Hello from applescript!"
```

```arcade
"Hello from arcade!"
```

```arduino
void setup() {
  Serial.begin(9600);
  Serial.println("Hello from arduino!");
}

void loop() {
}
```

```armasm
.data
msg: .asciz "Hello from armasm\n"
.text
.global _start
_start:
    mov x0, 1
    ldr x1, =msg
    ldr x2, =13
    mov x8, 64
    svc 0
```

```asciidoc
= Hello from asciidoc

Hello from asciidoc
```

```aspectj
public aspect HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello from aspectj");
    }
}
```

```autohotkey
MsgBox, Hello from autohotkey!
```

```autoit
MsgBox(0, "Title", "Hello from autoit!")
```

```avrasm
.cseg
.org 0
main:
    ldi r16, 0x01
    out 0x18, r16
    rjmp main
```

```awk
BEGIN { print "Hello from awk"; }
```

```axapta
static void helloWorld(Args _args)
{
    info("Hello from axapta");
}
```

```bash
echo "Hello from bash"
```

```basic
PRINT "Hello from basic"
```

```bnf
<hello> ::= "Hello from bnf"
```

```brainfuck
++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.
```

```c
#include <stdio.h>

int main() {
    printf("Hello from c\n");
    return 0;
}
```

```cal
OBJECT HelloWorld
  CAPTION = 'Hello World';
BEGIN
  MESSAGE('Hello from cal!');
END.
```

```capnproto
struct HelloWorld {
  text @0 :Text;
}
```

```ceylon
void hello() {
    print("Hello from ceylon");
}
```

```clean
module hello
import StdEnv

Start :: String
Start = "Hello from clean"
```

```clojure-repl
user=> (println "Hello from clojure-repl")
Hello from clojure-repl
nil
```

```clojure
(println "Hello from clojure")
```

```cmake
message(STATUS "Hello from cmake")
```

```coffeescript
console.log "Hello from coffeescript"
```

```coq
Definition hello_world := "Hello from coq".
```

```cos
Class HelloWorld Extends %RegisteredObject
{
  ClassMethod SayHello()
  {
    Write "Hello from cos",!
  }
}
```

```cpp
#include <iostream>

int main() {
    std::cout << "Hello from cpp" << std::endl;
    return 0;
}
```

```crmsh
primitive helloworld ocf:pacemaker:Dummy \
    op monitor interval="10s"
```

```crystal
puts "Hello from crystal"
```

```csharp
using System;

class Program
{
    static void Main()
    {
        Console.WriteLine("Hello from csharp");
    }
}
```

```csp
channel hello
hello! -> PRINT("Hello from csp")
```

```css
body::before {
  content: "Hello from css";
}
```

```d
import std.stdio;

void main() {
    writeln("Hello from d");
}
```

```dart
void main() {
  print('Hello from dart');
}
```

```delphi
program HelloWorld;
{$APPTYPE CONSOLE}
begin
  WriteLn('Hello from delphi');
end.
```

```diff
- "Привет, мир!"
+ "Hello from diff"
```

```django
<h1>Hello from django</h1>
```

```dns
helloworld.example.com. IN TXT "Hello from dns"
```

```dockerfile
FROM alpine
CMD ["echo", "Hello from dockerfile"]
```

```dos
@echo off
echo Hello from dos
```

```dsconfig
dn: cn=config
changetype: modify
replace: ds-cfg-hello-world
ds-cfg-hello-world: Hello from dsconfig
```

```dts
/dts-v1/;
/ {
    hello = "Hello from dts";
};
```

```dust
Hello, {name}!
```

```ebnf
hello_world = "Hello from ebnf";
```

```elixir
IO.puts "Hello from elixir"
```

```elm
import Html exposing (text)

main =
  text "Hello from elm"
```

```erb
<%= "Hello from erb" %>
```

```erlang-repl
1> io:fwrite("Hello from erlang-repl\n").
Hello from erlang-repl
ok
```

```erlang
-module(hello).
-export([hello_world/0]).

hello_world() ->
    io:fwrite("Hello from erlang\n").
```

```excel
= "Hello from excel"
```

```fix
8=FIX.4.2|9=42|35=A|34=1|49=SENDER|52=20250701-12:30:00|56=TARGET|98=0|108=30|10=168|
```

```flix
def main(): Unit = println("Hello from flix")
```

```fortran
program hello
  print *, "Hello from fortran"
end program hello
```

```fsharp
printfn "Hello from fsharp"
```

```gams
display "Hello from gams";
```

```gauss
print "Hello from gauss";
```

```gcode
G1 X0 Y0 F1000 ; Hello from gcode!
```

```gherkin
Feature: Hello World
  Scenario: Say hello
    Given I am on the home page
    When I click the "Hello" button
    Then I should see "Hello from gherkin"
```

```glsl
void main() {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // Red, for "Hello from glsl"
}
```

```gml
show_message("Hello from gml!");
```

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello from go")
}
```

```golo
function main = |args| {
  println("Hello from golo")
}
```

```gradle
task hello {
    doLast {
        println 'Hello from gradle'
    }
}
```

```graphql
query HelloWorld {
  hello
}
```

```groovy
println "Hello from groovy"
```

```haml
%p Hello from haml
```

```handlebars
<p>{{hello}}</p>
```

```haskell
main :: IO ()
main = putStrLn "Hello from haskell"
```

```haxe
class Main {
    static function main() {
        trace("Hello from haxe");
    }
}
```

```hsp
mes "Hello from hsp"
```

```http
GET / HTTP/1.1
Host: example.com

Hello from http
```

```hy
(print "Hello from hy")
```

```inform7
The World is a room. "Hello from inform7"
```

```ini
[greeting]
message = Hello from ini
```

```irpf90
PROGRAM HELLO
  PRINT *, "Hello from irpf90"
END PROGRAM
```

```isbl
function HelloWorld()
  ShowMessage('Hello from isbl');
end
```

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello from java");
    }
}
```

```javascript
console.log("Hello from javascript");
```

```jboss-cli
/system-property=hello:add(value="Hello from jboss-cli")
```

```json
{
  "greeting": "Hello from json"
}
```

```julia-repl
julia> println("Hello from julia-repl")
Hello from julia-repl
```

```julia
println("Hello from julia")
```

```kotlin
fun main() {
    println("Hello from kotlin")
}
```

```lasso
'Hello from lasso'
```

```latex
\documentclass{article}
\begin{document}
Hello from latex
\end{document}
```

```ldif
dn: cn=helloworld,dc=example,dc=com
objectClass: top
cn: helloworld
description: Hello from ldif
```

```leaf
#("Hello from leaf")
```

```less
.hello {
  content: "Hello from less";
}
```

```lisp
(print "Hello from lisp")
```

```livecodeserver
{"command": "log", "text": "Hello from livecodeserver"}
```

```livescript
console.log "Hello from livescript"
```

```llvm
define i32 @main() {
  ret i32 0
}
```

```lsl
default
{
    state_entry()
    {
        llSay(0, "Hello from lsl");
    }
}
```

```lua
print("Hello from lua")
```

```makefile
hello:
	echo "Hello from makefile"
```

```markdown
# Hello from markdown
```

```mathematica
Print["Hello from mathematica"]
```

```matlab
disp('Hello from matlab')
```

```maxima
print("Hello from maxima")$
```

```mel
print "Hello from mel\n";
```

```mercury
:- module hello.
:- interface.
:- import_module io.
:- pred main(io::di, io::uo) is det.
:- implementation.
main(!IO) :-
	io.write_string("Hello from mercury\n", !IO).
```

```mipsasm
.data
msg: .asciiz "Hello from mipsasm\n"
.text
main:
    li $v0, 4
    la $a0, msg
    syscall
```

```mizar
::MML::
environ
begin
  reserve i for Integer;
  i = 1;
end;
```

```mojolicious
% layout 'default';
% title 'Hello World';
Hello from mojolicious
```

```monkey
Function Main()
    Print "Hello from monkey"
End
```

```moonscript
print "Hello from moonscript"
```

```n1ql
SELECT "Hello from n1ql" AS greeting;
```

```nestedtext
greeting: Hello from nestedtext
```

```nginx
location / {
    return 200 'Hello from nginx';
}
```

```nim
echo "Hello from nim"
```

```nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.writeText "hello" "Hello from nix"
```

```node-repl
> console.log("Hello from node-repl");
Hello from node-repl
undefined
```

```nsis
Section "HelloWorld"
  MessageBox MB_OK "Hello from nsis"
SectionEnd
```

```objectivec
#import <Foundation/Foundation.h>

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSLog(@"Hello from objectivec");
    }
    return 0;
}
```

```ocaml
print_endline "Hello from ocaml"
```

```openscad
echo("Hello from openscad");
```

```oxygene
namespace HelloWorld;

interface

type
  Program = class
  public
    class method Main;
  end;

implementation

class method Program.Main;
begin
  Console.WriteLine('Hello from oxygene');
end;

end.
```

```parser3
{$greeting = "Hello from parser3"}
```

```perl
print "Hello from perl\n";
```

```pf
pass out on egress proto tcp to any port 80
```

```pgsql
SELECT 'Hello from pgsql';
```

```php-template
<?php echo "Hello from php-template"; ?>
```

```php
<?php
echo "Hello from php";
?>
```

```plaintext
Hello from plaintext
```

```pony
actor Main
  new create(env: Env) =>
    env.out.print("Hello from pony")
```

```powershell
Write-Host "Hello from powershell"
```

```processing
void setup() {
  println("Hello from processing");
}
```

```profile
[Service]
ExecStart=/bin/echo "Hello from profile"
```

```prolog
hello :- write('Hello from prolog'), nl.
```

```properties
greeting=Hello from properties
```

```protobuf
message HelloWorld {
  string greeting = 1;
}
```

```puppet
notify { 'Hello from puppet': }
```

```purebasic
If OpenConsole()
  PrintN("Hello from purebasic")
  Input()
EndIf
```

```python-repl
>>> print("Hello from python-repl")
Hello from python-repl
```

```python
print("Hello from python")
```

```q
`0: "Hello from q"
```

```qml
import QtQuick 2.0

Text {
    text: "Hello from qml"
}
```

```r
print("Hello from r")
```

```reasonml
print_endline("Hello from reasonml");
```

```rib
Display "Hello from rib" "stdout" "rgb"
```

```roboconf
instance of Component {
    name: "hello-world",
    installer: "bash",
    exports: "message = Hello from roboconf"
}
```

```routeros
/log info "Hello from routeros"
```

```rsl
function main()
{
    print("Hello from rsl");
}
```

```ruby
puts "Hello from ruby"
```

```ruleslanguage
rule "Hello World"
when
then
    System.out.println("Hello from ruleslanguage");
end
```

```rust
fn main() {
    println!("Hello from rust");
}
```

```sas
data _null_;
put 'Hello from sas';
run;
```

```scala
object HelloWorld extends App {
  println("Hello from scala")
}
```

```scheme
(display "Hello from scheme")
(newline)
```

```scilab
disp("Hello from scilab")
```

```scss
.hello:before {
  content: "Hello from scss";
}
```

```shell
$ echo "Hello from shell"
```

```smali
.method public static main([Ljava/lang/String;)V
    .registers 2
    sget-object v0, Ljava/lang/System;->out:Ljava/io/PrintStream;
    const-string v1, "Hello from smali"
    invoke-virtual {v0, v1}, Ljava/io/PrintStream;->println(Ljava/lang/String;)V
    return-void
.end method
```

```smalltalk
Transcript show: 'Hello from smalltalk'; cr.
```

```sml
print "Hello from sml\n";
```

```sqf
hint "Hello from sqf";
```

```sql
SELECT 'Hello from sql';
```

```stan
model {
  print("Hello from stan");
}
```

```stata
display "Hello from stata"
```

```step21
HEADER;
FILE_DESCRIPTION(('Hello from step21'),'2;1');
ENDSEC;
```

```stylus
.hello
  content: "Hello from stylus"
```

```subunit
test: hello
success: hello
```

```swift
print("Hello from swift")
```

```taggerscript
$tag(p, Hello from taggerscript)
```

```tap
ok 1 - Hello from tap
```

```tcl
puts "Hello from tcl"
```

```thrift
service HelloWorld {
  string sayHello()
}
```

```tp
program HelloWorld;
begin
  writeln('Hello from tp');
end.
```

```twig
{{ "Hello from twig" }}
```

```typescript
console.log("Hello from typescript");
```

```vala
void main () {
    print ("Hello from vala\n");
}
```

```vbnet
Module HelloWorld
    Sub Main()
        Console.WriteLine("Hello from vbnet")
    End Sub
End Module
```

```vbscript-html
<script type="text/vbscript">
  MsgBox "Hello from vbscript-html"
</script>
```

```vbscript
MsgBox "Hello from vbscript"
```

```verilog
module hello_world;
  initial begin
    $display("Hello from verilog");
    $finish;
  end
endmodule
```

```vhdl
entity hello_world is
end hello_world;

architecture behavioral of hello_world is
begin
  process
  begin
    report "Hello from vhdl";
    wait;
  end process;
end behavioral;
```

```vim
:echo "Hello from vim"
```

```wasm
(module
  (import "console" "log" (func $log (param i32 i32)))
  (import "js" "mem" (memory 1))
  (data (i32.const 0) "Hello from wasm")
  (func (export "main")
    i32.const 0
    i32.const 13
    call $log
  )
)
```

```wren
System.print("Hello from wren")
```

```x86asm
section .data
    msg db 'Hello from x86asm', 0xa
    len equ $ - msg

section .text
    global _start

_start:
    mov edx, len
    mov ecx, msg
    mov ebx, 1
    mov eax, 4
    int 0x80

    mov ebx, 0
    mov eax, 1
    int 0x80
```

```xl
program HelloWorld;
  Console.WriteLine("Hello from xl");
end HelloWorld;
```

```xml
<greeting>Hello from xml</greeting>
```

```xquery
"Hello from xquery"
```

```yaml
greeting: Hello from yaml
```

```zephir
namespace HelloWorld;

class Greeting
{
    public static function say()
    {
        echo "Hello from zephir";
    }
}
```
