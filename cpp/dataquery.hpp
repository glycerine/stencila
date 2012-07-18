/*
Copyright (c) 2012 Stencila Ltd

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is 
hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD 
TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. 
IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR 
CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA
OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

//! @file dataquery.hpp
//! @brief Definition of class Dataquery

#pragma once

#include <string>
#include <vector>

#include <boost/format.hpp>
#include <boost/lexical_cast.hpp>
#include <boost/algorithm/string/join.hpp>

#include "exception.hpp"
#include "datacolumn.hpp"

namespace Stencila {
	

	
class Directive {
public:	
	virtual std::string dql(void) const {
		return "";
	}
	virtual std::string sql(void) const {
		return "";
	}
};

class Value : public Directive {
public:
};

class Column : public Value {
private:
	std::string name_;
public:
	Column(const std::string& name):
		name_(name){
	}
	virtual std::string dql(void) const {
		return name_;
	}
	virtual std::string sql(void) const {
		return "\"" + name_ + "\"";
	}
};

template<typename Type> class Constant;

template<>
class Constant<void> : public Value {
	
};

template<typename Type>
class Constant : public Constant<void> {
private:
	Type value_;

public:
	Constant(const Type& value):
		value_(value){
	}
	virtual std::string dql(void) const {
		return boost::lexical_cast<std::string>(value_);
	}
	virtual std::string sql(void) const {
		return boost::lexical_cast<std::string>(value_);
	}
};

class Call : public Directive {
private:
	std::string name_;
	std::vector<const Directive*> args_;
public:
	template<
		typename... Directives
	>
	Call(const std::string& name,const Directives&... dirs):
		name_(name){
		append(dirs...);
	}
	
	Call& append(void){
		return *this;
	}
	
	template<
		typename Directive,
		typename... Directives
	>
	Call& append(const Directive& dir,const Directives&... dirs){
		args_.push_back(new Directive(dir));
		append(dirs...);
		return *this;
	}
	
	
	virtual std::string dql(void) const {
		std::vector<std::string> args;
		BOOST_FOREACH(const Directive* arg, args_){
			args.push_back(arg->dql());
		}
		return name_+"("+boost::algorithm::join(args, ", ")+")";
	}
	
	virtual std::string sql(void) const {
		std::vector<std::string> args;
		BOOST_FOREACH(const Directive* arg, args_){
			args.push_back(arg->sql());
		}
		return name_+"("+boost::algorithm::join(args, ", ")+")";
	}
};

class Group : public Directive {
protected:
	const Directive* expr_;
public:
	template<class Expression>
	Group(const Expression& expr):
		expr_(new Expression(expr)){
	}
	virtual std::string dql(void) const {
		return "("+expr_->dql()+")";
	}
	virtual std::string sql(void) const {
		return "("+expr_->sql()+")";
	}
};

template<int Code>
class UnaryOperator : public Directive {
protected:
	const Directive* expr_;
public:
	template<class Expression>
	UnaryOperator(const Expression& expr):
		expr_(new Expression(expr)){
	}

	virtual std::string dql(void) const {
		return dql_symbol+expr_->dql();
	}
	virtual std::string sql(void) const {
		return sql_symbol+expr_->sql();
	}
	
	static const char* dql_symbol;
	static const char* sql_symbol;
};

#define UNOP(code,name,dql,sql) \
	typedef UnaryOperator<code> name; \
	template<> const char* name::dql_symbol = dql; \
	template<> const char* name::sql_symbol = sql; 

UNOP(5,Positive,"+","+")
UNOP(6,Negative,"-","-")
UNOP(7,Not,"!","not")

#undef UNOP


template<int Code>
class BinaryOperator : public Directive {
protected:
	const Directive* left_;
	const Directive* right_;
public:
	template<class Left, class Right>
	BinaryOperator(const Left& left, const Right& right):
		left_(new Left(left)),
		right_(new Right(right)){
	}

	virtual std::string dql(void) const {
		return left_->dql() + dql_symbol + right_->dql();
	}
	
	virtual std::string sql(void) const {
		return left_->sql() + sql_symbol + right_->sql();
	}
	
	static const char* dql_symbol;
	static const char* sql_symbol;
};

#define BINOP(code,name,dql,sql) \
	typedef BinaryOperator<code> name; \
	template<> const char* name::dql_symbol = dql; \
	template<> const char* name::sql_symbol = sql;

BINOP(10,Multiply,"*","*")
BINOP(11,Divide,"/","/")
BINOP(12,Plus,"+","+")
BINOP(13,Subtract,"-","-")

BINOP(18,Equal,"==","==")
BINOP(19,NotEqual,"!=","!=")
BINOP(20,LessThan,"<","<")
BINOP(21,LessThanEqual,"<=","<=")
BINOP(22,GreaterThan,">",">")
BINOP(23,GreaterThanEqual,">=",">=")

BINOP(30,And," and "," AND ")
BINOP(31,Or," or "," OR ")

#undef BINOP

class Distinct  : public Directive {
public:
};

class All  : public Directive {
public:
};

class Clause : public Directive {
protected:
	const Directive* expr_;
public:
	template<class Expression>
	Clause(const Expression& expr):
		expr_(new Expression(expr)){
	}
	
	virtual std::string dql(void) const {
		return expr_->dql();
	}
	
	virtual std::string sql(void) const {
		return expr_->sql();
	}
};

class Where : public Clause {
public:
	template<class Expression>
	Where(const Expression& expr):
		Clause(expr){
	}
	
	virtual std::string dql(void) const {
		return "where("+expr_->dql()+")";
	}
};

class By : public Clause {
public:
	template<class Expression>
	By(const Expression& expr):
		Clause(expr){
	}
	
	virtual std::string dql(void) const {
		return "by("+expr_->dql()+")";
	}
};

class Having : public Clause {
public:
	template<class Expression>
	Having(const Expression& expr):
		Clause(expr){
	}
	
	virtual std::string dql(void) const {
		return "having("+expr_->dql()+")";
	}
};

class Order : public Clause {
private:
	float dir_;
	
public:
	template<class Expression>
	Order(const Expression& expr,const float& dir=1):
		Clause(expr),
		dir_(dir){
	}
	
	float direction(void) const {
		return dir_;
	}
	
	virtual std::string dql(void) const {
		std::string dql = "order(" + expr_->dql();
		if(dir_!=1) dql += "," + boost::lexical_cast<std::string>(dir_);
		return dql + ")";
	}
};

class Limit : public Clause {
public:
	template<class Expression>
	Limit(const Expression& expr):
		Clause(expr){
	}
	
	virtual std::string dql(void) const {
		return "limit("+expr_->dql()+")";
	}
};

class Offset : public Clause {
public:
	template<class Expression>
	Offset(const Expression& expr):
		Clause(expr){
	}
	
	virtual std::string dql(void) const {
		return "offset("+expr_->dql()+")";
	}
};


//! @class Dataquery
//! @todo Document fully
class Dataquery : public Directive {

private:
	std::vector<const Directive*> directives_;
	std::string table_;
	
	bool compiled_;

	bool distinct_;
	std::vector<const Directive*> values_;
	std::vector<const Where*> wheres_;
	std::vector<const By*> bys_;
	std::vector<const Having*> havings_;
	std::vector<const Order*> orders_;
	const Limit* limit_;
	const Offset* offset_;

public:

	//! @name Append directives
	//! @brief Append directives to the dataquery
	//! @{
	
	Dataquery& append(void){
		return *this;
	}
	
	template<
		typename Directive,
		typename... Directives
	>
	Dataquery& append(const Directive& dir,const Directives&... dirs){
		directives_.push_back(new Directive(dir));
		compiled_ = false;
		append(dirs...);
		return *this;
	}
	
	//! @}
	
	Dataquery& from(const std::string& name){
		table_ = name;
		return *this;
	}
	
	Dataquery& compile(void){
		if(not compiled_){
			//Reset members
			distinct_ = false;
			values_.clear();
			wheres_.clear();
			bys_.clear();
			havings_.clear();
			orders_.clear();
			limit_ = 0;
			offset_ = 0;
			
			BOOST_FOREACH(const Directive* directive, directives_){
				if(dynamic_cast<const Distinct*>(directive)){
					distinct_ = true;
				}
				else if(dynamic_cast<const All*>(directive)){
					distinct_ = false;
				}
				else if(const Where* where = dynamic_cast<const Where*>(directive)){
					wheres_.push_back(where);
				}
				else if(const By* by = dynamic_cast<const By*>(directive)){
					bys_.push_back(by);
					values_.push_back(by);
				}
				else if(const Having* having = dynamic_cast<const Having*>(directive)){
					havings_.push_back(having);
				}
				else if(const Order* order = dynamic_cast<const Order*>(directive)){
					orders_.push_back(order);
				}
				else if(const Limit* limit = dynamic_cast<const Limit*>(directive)){
					limit_ = limit;
				}
				else if(const Offset* offset = dynamic_cast<const Offset*>(directive)){
					offset_ = offset;
				}
				else {
					values_.push_back(directive);
				}
			}
			
			compiled_ = true;
		}
		return *this;
	}
	
	std::string dql(void) {
		compile();
		std::string dql = table_ + "[";
		
		for(auto i=directives_.begin();i!=directives_.end();i++){
			dql += (*i)->dql();
			if(i!=directives_.end()-1) dql += ",";
		}
		
		dql += "]";
		return dql;
	}
	
	std::string sql(void) {
		compile();
		std::string sql = "SELECT";
		
		if(distinct_) sql += " DISTINCT";
		
		if(values_.size()==0){
			sql += " *";
		} else {
			sql += " ";
			for(auto i=values_.begin();i!=values_.end();i++){
				sql += (*i)->sql();
				if(i!=values_.end()-1) sql += ", ";
			}
		}
		
		sql += " FROM \"" + table_ + "\"";
		
		if(wheres_.size()>0){
			sql += " WHERE ";
			if(wheres_.size()>1) sql += "(";
			for(auto i=wheres_.begin();i!=wheres_.end();i++){
				sql += (*i)->sql();
				if(i!=wheres_.end()-1) sql += ") AND (";
			}
			if(wheres_.size()>1) sql += ")";
		}
		
		if(bys_.size()>0){
			sql += " GROUP BY ";
			for(auto i=bys_.begin();i!=bys_.end();i++){
				sql += (*i)->sql();
				if(i!=bys_.end()-1) sql += ", ";
			}
		}
		
		if(havings_.size()>0){
			sql += " HAVING ";
			if(havings_.size()>1) sql += "(";
			for(auto i=havings_.begin();i!=havings_.end();i++){
				sql += (*i)->sql();
				if(i!=havings_.end()-1) sql += ") AND (";
			}
			if(havings_.size()>1) sql += ")";
		}
		
		if(orders_.size()>0){
			sql += " ORDER BY ";
			for(auto i=orders_.begin();i!=orders_.end();i++){
				const Order* order = *i;
				sql += order->sql();
				if(order->direction()>0) sql += " ASC";
				else if(order->direction()<0) sql += " DESC";
				if(i!=orders_.end()-1) sql += ", ";
			}
		}

		if(limit_){
			sql += " LIMIT " + limit_->sql();
		}
		
		if(offset_){
			//Offset can only come after a limit clause. So add one if not present.
			//The theoretical maximum number of rows in an SQLite database
			//is 2^64 = 18446744073709551616 (see http://www.sqlite.org/limits.html)
			//However SQLite baulks at such a large integer in an limit clause so instead
			//we have to use the maximum value for an integer: 2^64/2
			if(not limit_) sql += " LIMIT 9223372036854775807";
			sql += " OFFSET " + offset_->sql();
		}

		return sql;
	}

};

}